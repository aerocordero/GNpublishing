/*
	Workshet preview generate requires graphicsmagick binary installed in the system
	Mac Os installation: `brew install graphicsmagick`
*/
// 8/5: 5.20, 

async function main() {
	const mysql = require('mysql2');
	const bluebird = require('bluebird');
	const parse = require('node-html-parser').parse;
	const fs = require('fs');
	const http = require('https');
	const _ = require('lodash');
	const Jimp = require('jimp');
	const argv = require('yargs').argv;
	const Json2csvParser = require('json2csv').Parser;
	
	const config = require('./config.json');
	
	const {
		decodeHtml,
		asyncForEach,
		downloadFile,
		convertImage,
		imageInfo,
		getImgPropheight,
		dbQuery,
		apiQuery,
		closeDbConnection,
		convertPdf,
		processObjectFieldsIntoBlocks,
		parseHTMLIntoBlocks,
		cleanUpHTML,
		initCustomPages,
		GDFolderSync,
		getImgInfoAndRotate,
		loadQueue,
		saveQueue,
		arrayUnique,
		convertPptxPdf,
		parseHtml
	} = require('./lib/utils');
	const { materialsQtySet } = require('./lib/greenninja');
	const PDFUtilsObj  = require('./lib/pdf-utils');
	
	console.log('Google Drive folder syncing...')
	//console.log(argv);
	if (argv.gdSync || argv.gdSync===undefined){
		await GDFolderSync('19sNmj1BXrBWV6M2JTL4r-lJp5Iw8n-96', 'teacherbook');
	}
	const notFoundWorksheets=[];
	//config.db.Promise=bluebird;
	
	const colors={
		unitTitle: '#15ADCB',
		green: '#6FAC44',
		greenNinja: '#548235',
		lessonGreen: '#8cc343',
		lessonFiles: '#FF5609',
		brown: '#634439',
		black: 'black',
		blue: '#26adca',
		orange: '#ff5609'
	}
	
	const gradeColors={
		'Grade 6': '#FF5609',
		'Grade 7': '#15ADCB',						
		'Grade 8': '#89C440',
	}
	const chapterColors=['#bedb83', '#85b838', '#589b31','#3f7c1f', '#346d24', '#205b1a', '#153c0b'];
	
	const textIdents={
		left: 65,
		top: 70
	}
	
	const fonts={
		regular: 'fonts/Muli-Regular.ttf',
		bold: 'fonts/Muli-Bold.ttf',
		semiBold: 'fonts/Muli-SemiBold.ttf',
		italic: 'fonts/Muli-Italic.ttf',
		boldItalic: 'fonts/Muli-BoldItalic.ttf',
		arial: 'fonts/arial-unicode-ms.ttf', 
	}
	
	const icons={
		onlineContent:'images/icons/Dynamic_Icon_TC.png',
		studentContent: 'images/icons/Student_Icon_TC.png'
	}
	
	
	
	console.log('Connected to the DB');
	
	const modelId=argv.model || 19;
	const unitId=argv.unit || 35;
	const printLessonNum=(argv.lesson || '').toString();
	const queueItemId=argv.queueItemId;
	const disableImages=argv.disableImages;
	console.log(queueItemId);
	console.log(printLessonNum);
	//return;

	const gdriveFolder=__dirname+'/gdrive/teacherbook';
	const customPages=await initCustomPages(gdriveFolder);
	
	console.log('Loading data...');
	
	const model=(await dbQuery([
		'SELECT * FROM `model` t',
		'WHERE t.`model_id` = ?'
	], [modelId]))[0];

	const allModels=(await dbQuery([
		'SELECT model_id, unit_id FROM `model` t',
	], [modelId]));
	
	const unit=(await dbQuery([
		'SELECT * FROM `unit` t',
		'WHERE t.`unit_id` = ?'
	], [unitId]))[0];
	unit.files=[];
	unit.number=model.unit_id.split(',').indexOf(unit.unit_id+"")+1;
	
	const allUnits=(await dbQuery([
		'SELECT unit_id, lessons FROM `unit` t',
	], []));
	
	unit.review=(await dbQuery([
		'SELECT * FROM `unit_review` t',
		'WHERE t.`unit_id` = ?  '
	], [unitId]));
	
	unit.epc=await dbQuery([
		'SELECT *',
		'FROM environmental_principle_copy t',
		'ORDER BY t.environmental_principle_id'
	], []);		
	
	await asyncForEach(unit.review, async (item)=>{
		item.activityPlan=await dbQuery([
			'SELECT *',
			'FROM unit_review_activity_plan t   ',
			'WHERE t.unit_review_id = ?  '
		], [item.unit_review_id]);

		item.activityPlan.forEach(plan=>{
			const headerMatch=plan.header.match(/([\d]+)\.(.*)/i);
			//console.log(headerMatch);
			if (headerMatch){
				plan.number=parseInt(headerMatch[1]);
				plan.title=(headerMatch[2] || '').trim();
			}
			else {
				plan.number=plan.position+1;
				plan.title=plan.header;
			}
			
		})
	});
	
	unit.reviewWorkshet=await dbQuery([
		'SELECT *',
		'FROM unit_worksheet_mapping m',
		'JOIN worksheet_unit_review t ON m.worksheet_unit_review_id = t.worksheet_unit_review_id',
		'INNER JOIN file f ON f.id = t.file_id',
		'WHERE m.unit_id = ? AND t.worksheet_language_id=1 '
	], [unitId]);
	const reviewFilesRoot=parse(unit.review[0].files).querySelectorAll('li');
	unit.reviewWorkshet.forEach(item=>{
		
		const pathArr=item.path.split('/');
		item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
		item.fileNameWithExt=item.fileName+'.'+item.type;
		item.fileTitle=item.originalname || item.fileName;
		if (item.s3_filename){
			item.path='/getWordDoc?path=/uploads/lessons/'+item.s3_filename
		}
		
		const node=reviewFilesRoot.find(n=>n.rawText.indexOf(item.fileName)>=0);				
		
		item.textIndex=unit.review[0].files.indexOf(item.fileName);
		if(node && node.querySelector('em')){
			item.title=node.querySelector('em').text.replace(model.display_name, '').replace('Unit '+unit.number, '').trim();
		}
		
	})
	unit.reviewWorkshet=_.sortBy(unit.reviewWorkshet, file=>file.textIndex);
	
	let lessons=await dbQuery([
		'SELECT * FROM `lesson` t',
		'INNER JOIN `unit_lesson_mapping` m',
		'ON t.`lesson_id`=m.`lesson_id` AND m.`unit_id` = ?',
	], [unitId]);
	let allLessons=await dbQuery([
		'SELECT lesson_id, old_lesson_id, name FROM `lesson` t',
	], []);
	const standardTypes=['pe', 'ccc', 'ccm', 'ccl', 'sep', 'dci', 'eld'];
	unit.orphanStandards={};
	unit.commonCoreStandards={};	
	standardTypes.forEach(key=>{
		unit.orphanStandards[key]=[];
		unit.commonCoreStandards[key]=[];		
	})
	
	const epConcepts=(await dbQuery([
		'SELECT * FROM `EP_concepts` t'
	], []));
	//console.log('epConcepts', epConcepts);


	
	await asyncForEach(lessons, async (lesson)=>{
		lesson.standards=await apiQuery(`/lessons/${modelId}/${unitId}/${lesson.lesson_id}/lessonStandards?orphan=0`);
		lesson.orphanStandards=await apiQuery(`/lessons/${modelId}/${unitId}/${lesson.lesson_id}/lessonStandards?orphan=1`);
		lesson.performanceExpectations=await apiQuery(`/lessons/${modelId}/${unitId}/${lesson.lesson_id}/lessonPerformanceExpectations`);
		lesson.allStandards=[];
		['standards', 'orphanStandards'].forEach(key=>{
			(lesson[key] || []).forEach(st=>{
				let stObj=lesson.allStandards.find(s=>s.name===st.name);
				if (!stObj){
					stObj=_.cloneDeep(st);
					lesson.allStandards.push(stObj);
				}
				st.items.forEach(stItem=>{
					if (!stObj.items.find(si=>si.id===stItem.id)){
						stObj.items.push(stItem);
					}
				})
				stObj.items.forEach(item=>{
					if (!item.name){
						item.name=item.title;
					}
				})
				stObj.items=_.sortBy(arrayUnique(stObj.items, 'name'), item=>item.priority);
			})	
		})
		
		//console.log(lesson.orphanStandards);
		
		
		
		lesson.worksheet=await dbQuery([
			'SELECT *',
			'FROM lesson_worksheet_mapping m',
			'JOIN worksheet t ON m.worksheet_id = t.worksheet_id',
			'INNER JOIN file f ON f.id = t.file_id',
			'WHERE m.lesson_id = ? AND t.type NOT IN ("docx", "doc", "rtf") AND t.worksheet_language_id=1'
		], [lesson.lesson_id]);
		lesson.worksheet=_.sortBy(lesson.worksheet, item=>item.type!=='pptx').map(item=>{
			item.text_snapshot='';
			if (item.s3_filename){
				item.path='/getWordDoc?path=/uploads/lessons/'+item.s3_filename;
			}
			return item;
		});
		
		lesson.activityPlan=await dbQuery([
			'SELECT *',
			'FROM activity_plan t',
			'WHERE t.lesson_id = ?',
			'ORDER BY t.position ASC, t.header ASC'
		], [lesson.lesson_id]);
		lesson.vocab=await dbQuery([
			'SELECT *',
			'FROM lesson_vocab_mapping m',
			'JOIN vocab t ON m.vocab_id = t.vocab_id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);	
		

		//console.log(lesson.worksheet);
		
		/*
		standardTypes.forEach(key=>{
			lesson[key].forEach(item=>{
				if (!unit.orphanStandards[key].find(a=>a[key+'_id']===item[key+'_id']) && (item.orphan===undefined || (item.orphan!==undefined && item.orphan))){
					unit.orphanStandards[key].push(item);
				}
				if (!unit.commonCoreStandards[key].find(a=>a[key+'_id']===item[key+'_id']) && !item.orphan){
					unit.commonCoreStandards[key].push(item);
				}
			});
		})
		*/
	});
	unit.orphanStandards=await apiQuery(`/units/${modelId}/${unitId}/unitStandards?orphan=1`);
	unit.standards=await apiQuery(`/units/${modelId}/${unitId}/unitStandards?orphan=0`);
	/*
	return; 
	standardTypes.forEach(key=>{
		unit.orphanStandards[key]=_.sortBy(unit.orphanStandards[key], item=>item.title);
		unit.commonCoreStandards[key]=_.sortBy(unit.commonCoreStandards[key], item=>item.title);
	});
	*/
	//unit.unitPerformanceExpectations=await apiQuery('/units/'+unit.unit_id+'/unitPerformanceExpectations');
	//unit.commonCoreStandardsResult=await apiQuery('/units/'+unit.unit_id+'/commonCoreStandards');
	
	//return;
	const allWorkShets=[];	
	
	const unitLessonIds=unit.lessons.split(',');

	let chapters=(await dbQuery([
		'SELECT t.*, rc_pdf_ws.path as rc_pdf_worksheet, rc_ques_pdf.path as rc_ques_pdf_worksheet, rc_ques_key_pdf.path as rc_ques_key_pdf_worksheet FROM `chapter` t',
		'LEFT OUTER JOIN worksheet rc_pdf_ws ON rc_pdf_ws.worksheet_id=t.rc_pdf_worksheet_id',
		'LEFT OUTER JOIN worksheet rc_ques_pdf ON rc_ques_pdf.worksheet_id=t.rc_ques_pdf_worksheet_id',
		'LEFT OUTER JOIN worksheet rc_ques_key_pdf ON rc_ques_key_pdf.worksheet_id=t.rc_ques_key_pdf_worksheet_id'
	], []));
	let chapterLessonMappings=(await dbQuery([
		'SELECT * FROM `chapter_lesson_mapping` t',
		'ORDER BY t.position',
	], []));

	/* 
	  {table: 'green_box'},
  {table: 'green_box_slides'},
  {table: 'chapter_green_box_mapping'},
	*/
	const greenBoxes=(await dbQuery([
		'SELECT t.*, m.chapter_id FROM `green_box` t',
		'INNER JOIN chapter_green_box_mapping m ON m.green_box_id=t.id AND m.chapter_id IN ('+chapters.map(ch=>ch.id).join(',')+')',
		'ORDER BY m.position ASC'
	], []));

	const greenBoxSlides=(await dbQuery([
		'SELECT t.*, f.s3_filename, f.s3_bucket FROM `green_box_slides` t',
		'INNER JOIN file f ON f.id = t.image_file_id',
		'WHERE t.green_box_id IN ('+greenBoxes.map(ch=>ch.id).join(',')+')',
		'ORDER BY t.position ASC'
	], []));
	

	chapters.forEach(chapter=>{
		chapter.greenBoxes=greenBoxes.filter(gb=>gb.chapter_id===chapter.id);
		chapter.greenBoxes.forEach(gb=>{
			gb.slides=greenBoxSlides.filter(slide=>slide.green_box_id===gb.id);
			gb.slides.forEach(slide=>{
				slide.imagePath=slide.s3_filename ? `/getSecuredImages?imagePath=/uploads/lessons/${slide.s3_filename}` : '';
			})
		})
		//console.log(chapter.greenBoxes);
	})
	

	unit.chapterMappings=chapterLessonMappings.filter(lm=>{
		if (!lm.is_review){
			lm.lesson=lessons.find(l=>l.lesson_id==lm.lesson_id);
			return lm.lesson;
		}
	});

	unit.chapterMappings=_.sortBy(unit.chapterMappings, lm=>lm.lesson.index);
	const chapterGroups=[];
	unit.chapterMappings.forEach(uch=>{
		let obj=chapterGroups.find(chg=>chg.id===uch.chapter_id);
		const chapterObj=chapters.find(ch=>ch.id==uch.chapter_id);
		if (!chapterObj){
			return;
		}
		if (!obj){
			obj=chapterObj;
			chapterGroups.push(obj);
			//console.log(uch);
			obj.unitChapters=[];
		}
		obj.unitChapters.push(uch);
	});
	chapterGroups.forEach((chapter)=>{
		chapter.lessons=unit.chapterMappings.filter(uch=>uch.chapter_id===chapter.id);
	})
	
	const lessonWorkshetTextReplace=(lesson, obj, fields)=>{
		obj.files=[];
		fields.forEach(field=>{
			if (!obj[field]){
				console.log('Not found field', {field, lesson_id: obj.lesson_id});
				return;
			}
			
			obj[field]=obj[field].replace(new RegExp('\(\{\{([a-zA-Z0-9\-\+\$@]+)\}\}([a-zA-Z0-9\-\.]+)\)', 'igm'), (match, str, old_lesson_id, str1, str2)=>{
				//console.log('old_lesson_id', old_lesson_id, str);
				const fileLesson=lessons.find(l=>l.old_lesson_id===old_lesson_id);
				if (!fileLesson){
					console.log('Not found Lesson', old_lesson_id);
					return str;
				}
				//console.log('regexp_'+field, match, str, str1);
				const workshet=fileLesson.worksheet.find(file=>file.fileNameWithExt?.toLowerCase()===str1.trim().toLowerCase() || file.originalname?.toLowerCase()===str1.trim().toLowerCase());
				//console.log(workshet);
				if (!workshet){
					console.log('Workshet "'+str1+'" is not found');
					//console.log('regexp_'+field, match, str, str1);
					if (str1!=='.' && !notFoundWorksheets.find(item=>item.worksheet===str1 && item.lesson===lesson.number)){
						notFoundWorksheets.push({
							lesson: lesson.number,
							worksheet: str1,
						})
					}
				}
				if (workshet){
					if (lesson.lesson_id===fileLesson.lesson_id){
						obj.files.push(workshet);
					}
					//console.log(workshet);					
					//return workshet.fileTitle;
					return '%'+workshet.worksheet_id+'%';
				}
				return str;
			});
			//console.log(field, obj[field]);
		})
	}
	
	lessons.forEach(lesson=>{
		lesson.index=unitLessonIds.indexOf(lesson.old_lesson_id);
		lesson.number=unit.number+'.'+(lesson.index+1);
		lesson.worksheet.forEach(file=>{
			allWorkShets.push(file);
		})
	});
	lessons=_.sortBy(lessons, l=>l.index);

	unit.chapters=_.sortBy(chapterGroups, ch=>{
		//ch.lessons[0].lesson?.number
		const chLesson=ch.lessons[0];
		const lesson=lessons.find(lesson=>lesson.lesson_id===chLesson.lesson_id);
		//console.log('lesson.number', lesson.index);
		return lesson.index;
	});
	unit.chapters.forEach((chapter, index)=>{
		chapter.number=index+1;
	});
	//return;
	
	lessons.forEach(lesson=>{
		/*
		lesson.pe.forEach(item=>{
			item.lessons=_.uniq(lessons.filter(l=>l.pe.find(p=>p.pe_id===item.pe_id && !p.orphan && !p.hidden) && l.lesson_id!==lesson.lesson_id).map(l=>l.number)).join(', ');
		});
		*/
		lesson.worksheet.forEach(item=>{
			const pathArr=item.path.split('/');
			item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
			item.fileNameWithExt=item.fileName+'.'+item.type;
			item.originalFileName=(item.originalname || item.fileNameWithExt);
			item.fileTitle='Lesson '+lesson.number+item.originalFileName;
			
			item.isOnline=item.fileName.indexOf('checkpoint')>0
				|| item.fileName.indexOf('culminating-experience')>0 
				|| customPages['dynamic-content-files'].indexOf(item.fileNameWithExt)>=0
				//|| item.type==='pptx';
			item.isOnlineAccess=item.fileName.indexOf('transcript')>0;
			if (item.isOnline){
				item.page=customPages.messages.onlineContent;
			}
			if (item.isOnlineAccess){
				item.page=customPages.messages.onlineAccessContent;
			}
			if (item.originalFileName.indexOf('phenomenon')>=0){
				console.log('phenomenonWS', item.originalFileName);
				lesson.hasPhenomenonFile=true;
			}
		});
		lesson.worksheet=_.sortBy(lesson.worksheet, file=>file.fileName);
		//console.log(lesson.worksheet);
		lesson.activityPlan.forEach(plan=>{
			plan.files=[];
			lessonWorkshetTextReplace(lesson, plan, ['content']);		
			//plan.number=plan.position ? plan.position+1 : '';
			//console.log(item.content);
			const headerMatch=plan.header.match(/([\d]+)\.(.*)/i);
			//console.log(headerMatch);
			if (headerMatch){
				plan.number=plan.position ? plan.position+1 : parseInt(headerMatch[1]);
				plan.title=(headerMatch[2] || '').trim();
			}
			else {
				plan.title=plan.header;
				plan.number=plan.position+1;
			}
			
		});
		lessonWorkshetTextReplace(lesson, lesson, ['anticipated_challenges', 'teacher_prep','list_materials', 'background', 'access_equity', 'home_to_school', 'prior_experience', 'student_preconceptions', 'all_together', 'safety_guidelines', 'extensions']);
	});
	//return;
	
	const lesson_sequence="'"+unit.lessons.split(',').join("','")+"'";
	
	const materialDataRaw=await dbQuery([
		"select res.material_id, res.lesson_id, res.name, res.provider, res.costperitem, res.dimensions_len,\n" +
		"res.dimensions_wide, res.dimensions_high, res.specifications_unit, res.weight, res.quantity_unit,\n" +
		"res.other_specs, res.plural_name, res.plural_quantity_unit, res.lesson_id, res.old_lesson_id,\n" +
		"res.id, res.quantity, res.reusableInd, res.optionalInd, res.forWhomInd, res.group_size,\n" +
		"res.activity_plan_id, res.alternative, res.notes, res.student_can_bring, res.lesson_material_order,\n" +
		"res.runsOutInd, res.kitReplacementInd, \n" +
		"l.name as lesson_name, field(l.old_lesson_id, " + lesson_sequence + ") as	sequence\n" +
		"from ( select\n" +
		"m.material_id, name, provider, costperitem, dimensions_len, dimensions_wide,\n" +
		"dimensions_high, specifications_unit, weight, quantity_unit, other_specs,\n" +
		"plural_name, plural_quantity_unit, lesson_id, old_lesson_id, id, quantity,\n" +
		"reusableInd, optionalInd, forWhomInd, group_size, activity_plan_id, alternative, notes,\n" +
		"student_can_bring, lesson_material_order, runsOutInd, kitReplacementInd\n" +
		"from lesson_materials_mapping lmm join materials m on\n" +
		"m.material_id = lmm.material_id\n" +
		"where lmm.lesson_id in (select lesson_id from unit_lesson_mapping where unit_id = ?)\n" +
		") res,lesson l\n" +
		" where l.lesson_id = res.lesson_id\n" +
		"order by res.optionalInd desc, sequence, res.lesson_material_order\n" +
		";"
	], [unitId]);
	
	//console.log('materialDataRaw', materialDataRaw);return;
	
	const materialData=materialsQtySet(_.cloneDeep(materialDataRaw));	

	lessons.forEach(lesson=>{
		lesson.materials=materialData.materialsListUnitOverview.filter(item=>item.lesson_id===lesson.lesson_id);
	})
	
	const processMaterialItemName=(item, quantity)=>{
		let name=item.plural_name || item.name;
		
		if (item.plural_name && quantity>1){
			name=item.plural_name;
		}
		else if (item.name) {
			name=item.name;
		}
		const nameArr=[{
			text: name,
			params: {
				continued: true
			}
		}];
		item.providerKit=item.provider==='Kit';
		
		const markers=['student_can_bring', 'runsOutInd', 'kitReplacementInd', 'providerKit', 'optionalInd'];
		item.markers=[];
		if (item.optionalInd){
			item.providerKit=item.kitReplacementInd=null;
		}
		
		markers.forEach(key=>{
			if (item[key]){
				const marker=markers.indexOf(key)+1;
				nameArr.push({
					text: ' '+marker,
					params: {
						features: ['sups'],
						continued: true
					}
				});
				item.markers.push(marker);
			}
		});
		if (item.markers.length){
			//console.log()
		}
		const dimentionsFields=['dimensions_wide', 'dimensions_len', 'dimensions_high'];
	
		if (dimentionsFields.find(field=>item[field]>0) || (item.other_specs || parseFloat(item.weight))){
			const weight=(parseFloat(item.weight) ? parseFloat(item.weight) : '');
			const otherSpecs=item.other_specs ? (weight ? weight+' ': '')+item.other_specs : weight;
			const dimentions=dimentionsFields.filter(field=>parseFloat(item[field])>0).map(field=>parseFloat(item[field]));
			//console.log('dimentionsdimentions', dimentions);
			nameArr.push({
				text: '\n('+(otherSpecs && !dimentions.length ? otherSpecs+(item.specifications_unit ? ' '+item.specifications_unit : '') : dimentions.join(' x ')+' '+(item.specifications_unit || item.other_specs))+')',
				params: {
					features: []
				}
			})
		}
		//console.log('nameArr', nameArr, item);
		return nameArr;
	};
	
	let materials={};
	['materialLsKit', 'materialLsTeacher', 'materialLsOptional'].map(key=>{
		const rawData=materialData[key];
		materials[key]=_.sortBy(_.values(_.groupBy(rawData, m=>m.material_id)).map(materials=>{	
			let item=materials[0];
			const items=materialData.materialsListUnitOverview.filter(m=>m.material_id===item.material_id && item.optionalInd===m.optionalInd);


			let quantity=parseFloat(item.totalQty);
			
			
			if (item.name==='Clear plastic cups'){
				//console.log('Ice_itemsitemsitemsitems', items);
			}
			if (item.plural_name==='PocketLab Temperature Probes'){
				console.log('PocketLab Temperature Probes_itemsitemsitemsitems', items);
			}
		
			items.forEach(item=>{
				//quantity+=(parseFloat(item.quantity) || 0);
				if (parseInt(item.quantity)>quantity){
					quantity=parseInt(item.quantity);
				}
				item.lesson=lessons.find(l=>l.lesson_id==item.lesson_id);
			});
		
			const nameArr=processMaterialItemName(item, quantity);
		
			if (quantity && item.plural_quantity_unit && item.quantity_unit){
				quantity+=' '+(quantity > 1 ? item.plural_quantity_unit : item.quantity_unit);
			}
		
			/*
			const alternative = items.filter(item=>item.alternative).map(item=>{
					return item.lesson.number + ' - '+ item.alternative;
				}).join(', ');
			const notes = items.filter(item=>item.notes).map(item=>{
				return item.lesson.number + ' - '+ item.notes;
			}).join(', ');
			*/
			const notes=item.notes.map(n=>unit.number+'.'+n.lesson_sequence + ' - '+ n.note).join(',\n');
			const alternative=item.alternative.map(n=>unit.number+'.'+n.lesson_sequence + ' - '+ n.alternative).join(', ');
			
			
			
			
			return _.extend(item, {
				name: nameArr.filter(n=>!n.params.features || !n.params.features.length).map(n=>n.text).join(' '),
				nameArr,
				quantity: quantity || '',
				lessons: _.uniq(_.sortBy(items.map(item=>{
					return item.lesson.number;
				}), number=>parseInt(number.split('.')[1]))).join(', '),
				alternative,
				notes,
				optionalInd: item.optionalInd,
				forWhomInd: item.forWhomInd,
				provider: item.provider,
				materialName: item.plural_name || item.name,
				firstLessonNum: items[0] ? parseInt(items[0].lesson.number.split('.')[1]) : 0,
			})
		}), m=>m.materialName);
		materials[key]=_.sortBy(materials[key], m=>m.name);
		materials[key]=_.sortBy(materials[key], m=>m.firstLessonNum);
		materials[key]=_.sortBy(materials[key], m=>m.materialName.replace(' ', ''));
	});
	//return;
	
	//const unitMaterials=await apiQuery(`/units/${unitId}/unitMaterials`);
	//console.log(unitMaterials);

	//unitMaterials 
	//return;
	//[m.materialName,m.lessons[0]
	//console.log(materials); return;
	
	console.log('Loaded Unit "'+unit.name+'" and '+lessons.length+' lessons');
	await closeDbConnection();
	
	const PDFUtils=new PDFUtilsObj(colors, fonts, textIdents);		
	
	PDFUtils.textWidth=490;
	const contentWidth=540;	
	
	PDFUtils.tocStyles={
		title: {
			text: 'Table of Contents', 
			idents: [textIdents.left, 40],
			font: fonts.bold,
			fontSize: 24,
		},
		level0: {
			font: fonts.bold,
			fontSize: 12,
			underline: true
		},
		level1: {
			font: fonts.bold,
			fontSize: 10,
		},
		level2: {
			font: fonts.regular,
			fontSize: 10,
			//width: contentWidth-textIdents.left-30
		},
		
		headerParams: {
			type: 'outerBox',
			color: '#41881d'
		},
		leftIdent: textIdents.left-10,
		levelIdent: 10,
		width: contentWidth-textIdents.left+20,
		lineParams: {
			leftIdent: textIdents.left,
			width: contentWidth+20+20
		},
		moveDown: 0.5,
	}
	PDFUtils.headerTextStyles={
		h1: {
			fontSize: 17,
			font: fonts.bold,
			color: 'black',
			startOnNewPage: false,
			dontChangeCurrentTitle: true,
			paddingBottom: 0.1,
			startOnRightSide: false
		}
	};
	
	PDFUtils.headerTitles=[
		{titleLeft: 'Unit Overview', titleRight: '', icon: 'images/icons/Unit Overview.png'},
		{titleLeft: 'Standards', titleRight: '', icon: 'images/icons/Standards.png'},
		{titleLeft: 'Materials', titleRight: '', icon: 'images/icons/Materials.png'},
		{titleLeft: 'Unit Resources', titleRight: '', icon: 'images/icons/Unit Resources.png'},		
	];	

	let currentLessonIdGlobal=0;
	
	PDFUtils.convertHtml=(text, currentLessonId)=>{
		if (!currentLessonId && currentLessonIdGlobal){
			currentLessonId=currentLessonIdGlobal;
		}
		const unitLessonIds=unit.lessons.split(',')
		return decodeHtml(text).replace(/\\n/g, '').replace(/\{\{([^\s]+)\}\}/g, (match, id)=>{
			//console.log(match, id);
			const item=lessons.find(l=>l.old_lesson_id===id);
			if (item){
				//console.log('Lesson '+item.number+(currentLessonId && currentLessonId!==item.old_lesson_id ? ''+item.name+' ' : ''), currentLessonId, item);
				return 'Lesson '+item.number+(currentLessonId && currentLessonId!==item.old_lesson_id ? ' '+item.name+'' : '');
			}//allLessons
			if (!item && id && id.indexOf('/')>=0){
				const idArr=id.split('/');
				const outerItem=allLessons.find(l=>l.old_lesson_id===idArr[2]);
				const model=allModels.find(m=>m.model_id==idArr[0]);
				const unit=allUnits.find(u=>u.unit_id==idArr[1]);
				//console.log('idArr', idArr, outerItem, model, unit);
				if (outerItem && model && unit) {
					outerItem.number=(model.unit_id.split(',').indexOf(unit.unit_id+"")+1)+'.'+(unit.lessons.split(',').indexOf(outerItem.old_lesson_id+"")+1);
					return 'Lesson '+outerItem.number+' '+outerItem.name+' ';
				}
			}
			return '';
		});
	}

	let blocks=[];
	
	const generateBlocks=async ()=>{
		blocks=[];
		unit.files=[];
		
		const coverIndex=((_.keys(gradeColors).indexOf(model.display_name)*6)+unit.number-1);
		//console.log(customPages.TeacherHighlight['tc-highlight-pages'][coverIndex]);
		
		blocks.push({
			type: 'pageBreak',
		});	
		//console.log('coverIndex', coverIndex, unit.number);
		blocks.push({
			type: 'image',
			value: customPages.TeacherHighlight['tc-highlight-pages'][coverIndex].imagePath,
			width: 610,
			x:-1,
			y:-1
		});	
		//console.log(customPages);
		await asyncForEach(['Dear-Educator','The-Green-Ninja-Approach','How-to-Teach-with-Green-Ninja'], async fileName=>{

			const paths=customPages['FrontMatter-2023'][fileName];
			console.log({fileName, paths});
			await asyncForEach(paths, async (item)=>{
				const imgInfo=await imageInfo(item.imagePath);
				blocks.push({
					type: 'pageBreak',
				});
				
				blocks.push({
					type: 'image',
					value: item.imagePath,
					width: 612,
					x:-1,
					y:-1
				});
				
			});
		})
		//return;
		/*
		blocks.push({
			type: 'h1',
			value:'Dear Educator,',
			startOnRightSide: false,
			noHeader:true,
			color: colors.lessonGreen,
			font: fonts.semiBold,
			leftIdent: 50,
			topIdent: 50,
			fontSize: 20,
			paddingBottom: 0.5,
			startOnNewPage: true,
		});
		
		await processObjectFieldsIntoBlocks(customPages.FrontMatter, [
			{title: '', field:'dear-educator', params:{
				fontSize: 11,
				leftTextIdent: 50,
				width: 520,
			}},
		], blocks);
		
		await asyncForEach(['unit-preperation', 'lesson-guides','lesson-files'].map((field, index)=>{
			return {
				field,
				ident: 50+(185*index),
			}
		}), async ({field, ident})=>{
			blocks.push({
				type: 'image',
				value: 'images/'+field+'.jpg',
				width: 140,
				x:ident+10,
				y:210
			});	
			
			blocks.push({
				type: 'setY',
				value: 370,
			});
			await processObjectFieldsIntoBlocks(customPages.FrontMatter, [
				{title: '', field, params:{
					fontSize: 11,
					leftTextIdent: ident,
					width: 148,
				}},
			], blocks);
			blocks.push({
				type: 'custom',
				drawFn: (doc)=>{
					doc.rect(ident-15, 360, 170, 125)
					.strokeColor('#A6A6A6').lineWidth(3).stroke();	
					doc.y+=20;
				},
			});
		});
		
		await processObjectFieldsIntoBlocks(customPages.FrontMatter, [
			{title: '', field:'dear-educator_bottom1', params:{
				fontSize: 11,
				leftTextIdent: 50,
				width: 520,
			}},
		], blocks);
		
		const legenda=[
			{icon: icons.onlineContent, text: customPages.messages.onlineContentDescription},
			{icon: icons.studentContent, text: customPages.messages.studentContentDescription},
		]
		blocks.push({
			type: 'custom',
			drawFn: (doc)=>{
				let y=doc.y+3;
				legenda.forEach(item=>{
					const x=45;
					
					doc.image(item.icon, x, y, {
						  width: 30,
						  align: 'center',
						  valign: 'center'
					});
					doc
					  .font(fonts.regular)
					  .fontSize(11)
					  .fill('black')
					  .text(item.text, x+30, y+3, {
					  	width: 450,
					  });
					//doc.moveDown(item.marginBottom || 0.2);
					y+=35;
				});
				doc.moveDown(0.5);
			}
		});	
		
		await processObjectFieldsIntoBlocks(customPages.FrontMatter, [
			{title: '', field:'dear-educator_bottom2', params:{
				fontSize: 11,
				leftTextIdent: 50,
				width: 520,
			}},
		], blocks);
		
		blocks.push({
			type: 'h1',
			value:'What Makes Green Ninja Special?',
			startOnNewPage: true,
			startOnRightSide: false,
			noHeader:true,
			color: colors.lessonGreen,
			font: fonts.semiBold,
			leftIdent: 50,
			topIdent: 50,
			fontSize: 20,
			paddingBottom: 0.5,
			align: 'center'
		});
		
		await processObjectFieldsIntoBlocks(customPages.FrontMatter, [
			{title: '', field:'what-makes-special', params:{
				fontSize: 10,
				leftTextIdent: 50,
				width: 520,
			}},
		], blocks);

	
	
		await asyncForEach([
			{
				field: 'unit-challenge',
				title: 'Unit Challenge',
			},
			{
				field: 'roadmap',
				title: 'Roadmap',
			},
			{
				field: 'culminating-experience',
				title: 'Culminating Experience',
			},
		], async ({field, title})=>{
			await processObjectFieldsIntoBlocks(customPages.FrontMatter, [
				{title, field, params:{
					fontSize: 10,
					leftTextIdent: 130,
					titleColor: colors.lessonGreen,
					width: 440,
					image: {
						value: customPages.FrontMatter[field+'_icon'],
						width: 55,
						x:50,
						marginTop: 0
					}
				}},
			], blocks);
		
		});
		
		blocks.push({
			type: 'image',
			value: customPages.FrontMatter['abstract_art'],
			width: 400,
			x:100,
			y: 550
		});	
		
		*/
			
		blocks.push({
			type: 'pageBreak',
		});	
		
		
		
		
		blocks.push({
			type: 'contents',
		});
		
		blocks.push({
			type: 'sectionCover',
			title: 'Unit Preparation',
			image: 'images/unit-preperation.jpg',
			color: colors.blue,
			addContents: true,
		})
		
		blocks.push({
			type: 'h1',
			value:'  ',
			startOnRightSide: false,
			startOnNewPage: true,
			headerTitle: {
				...PDFUtils.headerTitles.find(t=>t.titleLeft==='Unit Overview'),
				titleLeft: 'How a Unit Works  \nTeacher and Student Perspective',
				icon: null,
				titleLeftFontSize: 25,
				titleLeftTopIdent: 30,
				lineStartX: 60,
				lineEndX: 500,
				lineY: 95,
			},
			color: colors.lessonGreen,
			font: fonts.regular,
			leftIdent: 55,
			fontSize: 20,
			paddingBottom: 0.5,
			align: 'center',
			width: 500,
		});
		
		await processObjectFieldsIntoBlocks(customPages.HowUnitWorks, [
			{title: '', field:'content'},
		], blocks);
		//console.log('customPages.HowUnitWorks', customPages.HowUnitWorks);
		blocks.push({
			type: 'image',
			value: customPages.HowUnitWorks.image,
			width: 380,
			align: 'center',
			marginTop: 1
		});
		
		blocks.push({
			type: 'h1',
			value:'  ',
			startOnNewPage: true,
			startOnRightSide: false,
			font: fonts.regular,
			headerTitle: {
				...PDFUtils.headerTitles.find(t=>t.titleLeft==='Unit Overview'),
				titleLeft: 'Differentiation \nLearning Support',
				icon: null,
				titleLeftFontSize: 25,
				titleLeftTopIdent: 30,
				lineStartX: 50,
				lineEndX: 350,
				lineY: 95,
			},
			color: colors.lessonGreen,
			leftIdent: 55,
			fontSize: 20,
			paddingBottom: 0.5,
			align: 'center',
			width: 509,
		});
		//currentLessonId
		currentLessonIdGlobal=0;
		await processObjectFieldsIntoBlocks(customPages.DifferentiationLearningSupport, [
			{title: 'Differentiation and Special Learning Needs', field:'differentiation', 
				params: {
					width: 509,
					leftTextIdent: 60,
					moveDown: 0.2,
					fontSize: 9,
					//lineGap: 0.6,
				}
			},
			{title: 'Creating a Climate for Differentiated Instruction', field:'creating-a-climate', 
				params: {
					processListsAsBlocks: true,
					width: 509,
					leftTextIdent: 60,
					addSpaceAfterSize: 7,
					fontSize: 9,
					//lineGap: 0.6,
					moveDown: 0.2,
				}
			},
			{title: 'Additional Support for Differentiated Learning', field:'additional-support', 
				params: {
					processListsAsBlocks: true,
					width: 509,
					leftTextIdent: 60,
					fontSize: 9,
					//lineGap: 0.6,
					//moveDown: -0.0001,
				}
			},					
		], blocks);		

		
		blocks.push({
			type: 'h1',
			value:'Introduction',
			startOnRightSide: false,
			startOnNewPage: true,
			headerTitle: PDFUtils.headerTitles.find(t=>t.titleLeft==='Unit Overview'),
		});
		blocks.push({
			type: 'contentsPush',
			title: 'Unit Overview', 
			level: 1, 
			color: colors.black
		});
	
		blocks.push({
			type: 'introductions',
			value:[
				{title: 'Challenge', field:'introduction_challenge_description'},
				//{title: 'Phenomena', field:'introduction_phenomena_description'},
				{title: 'Science Methods', field:'introduction_science_methods_description'},
				{title: 'Culminating Experience', field:'introduction_culminating_experience_description'},
			],
			data: unit
		});
	
		await processObjectFieldsIntoBlocks(unit, [
			{title: 'Unit Storyline', field:'unit_storyboard', headerType:'h1', params:{
				dontChangeCurrentTitle: true,
				showTitleWhenParagraphBreaks: true,
				showTitleWhenParagraphBreaksType: 'h1',
				imgParams: {
					
				}
			}},
			{title: 'Unit Roadmap', field:'unit_roadmap', headerType:'h1',
				params: {
					imgParams: {
						//marginTop: 2,
						fitToPage: true,
					}
				}
			},
			{title: 'Science Background', field:'background_description', headerType:'h1'},
			{title: 'Science in Action', field:'science_in_action_description', breakAfter: true, headerType:'h2',
				params: {
					imgParams: {
						
					}
				}
			},
			{title: 'Green Ninja Connections', field: 'connections_description', breakAfter: true, headerType:'h1',
				params: {
					imgParams: {
						width: 465,
					}
				}
			},
			{title: 'Home to School Connections', field: 'home_to_school', headerType:'h1',
				params: {
					//processListsAsBlocks: true,
					//lineGap: 1.6,
				}
			},
			{title: 'Prior Knowledge', field: 'prior_knowledge', breakAfter: true, headerType:'h1'},
			{title: 'Assessment', field: 'assessment', headerType:'h1'/*, debug:true*/},
			{title: 'Identifying Preconceptions', field: 'identifying_preconceptions', headerType:'h1'},
			{title: 'Access and Equity', field: 'access_and_equity', headerType:'h1'},
			{title: 'Engineering Connections', field: 'eng_connections', headerType:'h1'},
			{title: 'Resources', headerType:'h1'},
			{title: 'Outside Educational Resources', field: 'outside_resources', headerType: 'h2', 
				params: {
					listsIdent: 13
				}
			},
			{title: 'Supplemental Resources', field: 'supplemental_resources', headerType: 'h2', 
				params: {
					listsIdent: 13
				}
			},
			{title: 'Technology and Teaching', field: 'tech_teaching', headerType:'h1', 
				params: {
					listsIdent: 13
				}
			},
			{title: 'Library and Information Science', field: 'lib_info_science', headerType:'h1',
				params: {
					listsIdent: 13
				}
			},
		], blocks);
		

		blocks.push({
			type: 'h1',
			value: 'NGSS Standards',
			headerTitle: PDFUtils.headerTitles.find(t=>t.titleLeft==='Standards'),
			startOnNewPage: true,
		});
		blocks.push({
			type: 'contentsPush',
			title: 'Standards', 
			level: 1, 
			color: colors.black
		});

		const standardItemsHtml=(items)=>{
			let html='<ul>';
			items.forEach(item=>{
				if (!item.title){
					return;
				}
				html+='<li>';
				html+=item.title;
				if (item.items.length){
					html+=standardItemsHtml(item.items);
				}
				html+='</li>';
			})			
			html+='</ul>';
			return html;			
		}

		const renderStandardItems=async(items)=>{
			const html=standardItemsHtml(items);
			//console.log({html});
			await asyncForEach(parse(html).childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el, {
					ident: 0,
					brFontSize: 0.5
				}, blocks);
			});	
		}
		
		await processObjectFieldsIntoBlocks(unit, [
			{title: '', field:'ngss_description'},
			//{title: 'Safety Guidelines', field:'materials_safety_guidelines'},
		], blocks);
		//console.log(unit.unitPerformanceExpectations);
		const unitPe=unit.standards.find(st=>st.name==='pe');
		if (unitPe && unitPe.items.length){
			blocks.push({
				type: 'h2',
				value: 'Unit Performance Expectations',
			});
			
			let peHtml='';
			unitPe.items.forEach(item=>{
				peHtml+='<p><strong>'+item.title+':</strong> '+item.description+'<br/></p>';
			})	;
			console.log({peHtml})			;
			await asyncForEach(parse(peHtml).childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el, {
					ident: 0,
					brFontSize: 1
				}, blocks);
			});
		}
		const otherStandards=unit.orphanStandards.filter(st=>st.items.length);

		if (otherStandards.length){
			blocks.push({
				type: 'h2',
				value: 'Connections to Other NGSS Standards',
			});
			let cccHtml='';
			cccHtml+='<p>The additional PE(s), SEP(s), DCI(s), and CCC(s) provided below are introduced or emphasized in the lessons in this unit.</p>';
			//cccHtml+='<p>Crosscutting Concept(s)</p>';				
			await asyncForEach(parse(cccHtml).childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el, {}, blocks);
			});
		}

		await asyncForEach(otherStandards, async standard=>{
			const items=standard.items;
			if (items.length){
				//console.log('c.title', c.title);
				blocks.push({
					type: 'h3',
					value: standard.title.toUpperCase(),
					isHtml:false,
					font: fonts.regular,
					ident: 0,
					marginTop: 0.5,
					marginBottom: 0.001,
					isTitle: true,
					params:{
						marginTop: 0.1,
						//marginBottom: 0.001,
					}
					
				});

				//await renderStandardItems(items);
				blocks.push({
					type: 'list',
					value: items.filter(item=>item.title && (!item.items.filter(st=>st.title).length || standard.name!=='ccc')).map(item=>item.title),
					notMoveDownAfter: false
				});
				if (standard.name==='ccc'){
					items.filter(item=>item.items.filter(st=>st.title).length).forEach(category=>{
						blocks.push({
							type: 'h4',
							value: category.title,
							isHtml:false,
							ident: 0,
							marginTop: 0.5,
							isTitle: true,
							marginBottom: 0.001,
						});
						blocks.push({
							type: 'list',
							value:category.items.map(item=>item.title),
							notMoveDownAfter: false
						});
					})		
				}
						
				
			}
		})		
		
		
		const ccStandard=unit.standards.find(st=>st.name==='cc');

		if (ccStandard){
			await processObjectFieldsIntoBlocks(unit, [
				{title: 'Common Core and CA ELD Standards', field:'common_core', headerType:'h1', breakAfter: true, params:{
					dontChangeCurrentTitle: true,
					//startOnNewPage: true,
				}},
				//{title: 'Safety Guidelines', field:'materials_safety_guidelines'},
			], blocks);

			ccStandard.items.forEach(category=>{
				blocks.push({
					type: 'p',
					value: category.title,
					isHtml:false,
					marginTop: 0.001,
					params: {
						//moveDown: 0.2
					}
				});
				blocks.push({
					type: 'list',
					value:category.items.map(item=>item.title),
					notMoveDownAfter: false
				});
			})	
		}
		
		const epcStandard=unit.standards.find(st=>st.name==='epc');
		
			
		
		if (epcStandard){
			await processObjectFieldsIntoBlocks(unit, [
				{title: "California's Environmental Principles and Concepts", field:'epc_description', headerType:'h1', 
					params:{
						dontChangeCurrentTitle: true,
						moveToNextPageIfNotFit: true
					}
				},
			], blocks);
			let epcHtml='<p><br/></p><ul>';

			_.each(epcStandard.items, item=>{
				epcHtml+='<li>'+item.title+'</li>';
			})		
			epcHtml+='</ul>'		
			await asyncForEach(parse(epcHtml).childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el, {
					ident: 0,
					brFontSize: 0.5
				}, blocks);
			});
		}	
		
		
		
				
		blocks.push({
			type: 'h1',
			value: 'NGSS LESSON MAPPING LEGEND',
			headerTitle: PDFUtils.headerTitles.find(t=>t.titleLeft==='Standards'),
			startOnNewPage: true
		});
		
		await processObjectFieldsIntoBlocks(customPages.NgssLessonMapping, [
			{title: '', field:'intro', 
				params: {
					
				}
			},
			{title: 'Performance Expectation (PE)', field:'pe', 
				headerType: 'h3',
				params: {
					marginTop: 0.6,
					titleColor: colors.green,
					lineGap: 0.4,
					marginBottom: 0.0001,
				}
			},
			{title: 'Science and Engineering Practice (SEP)', field:'sep', 
				headerType: 'h3',
				params: {
					marginTop: 0.6,
					marginBottom: 0.0001,
					titleColor: colors.green,
					lineGap: 0.4,
					//addSpaceAfter: false
				}
			},
			{title: 'Crosscutting Concepts (CCC)', field:'ccc', 
				headerType: 'h3',
				params: {
					marginTop: 0.6,
					titleColor: colors.green,
					lineGap: 0.4,
					marginBottom: 0.0001,
				},
				
			},					
		], blocks);		

		
		blocks.push({
			type: 'pageBreak',
		});
		
		blocks.push({
			type: 'p',
			value: 'The mapping below outlines how our lessons have aligned to California’s NGSS and EP&Cs.',
			isHtml: false
		});
		blocks.push({
			type: 'p',
			value: '',
			isHtml: false
		});
		
		//		
		
		blocks.push({
			type: 'table',
			//hideHeaders: true,
			headerColor: colors.lessonGreen,
			columns: [
				{
					id: 'lesson',
					header: model.display_name+' Unit '+unit.number,
					width: 55,
				},
				...[
				{
					id: 'pe',
					header: 'PE',
					align: 'left',
					width: 110,
				},
				{
					id: 'sep',
					header: 'SEP',
					align: 'left',
					width: 81,
				},
				{
					id: 'dci',
					header: 'DCI',
					align: 'left',
					width: 81,
				},
				{
					id: 'ccc',
					header: 'CCC',
					align: 'left',
					width: 81,
				},
				{
					id: 'epc',
					header: 'EP&C',
					align: 'left',
					width: 81,
				}].filter(header=>unit.standards.find(st=>st.name===header.id && st.items.length))
			],
			data: lessons.map(lesson=>{
				lesson.ep=[];
				
				const progressions={
					Introductory:'Intro',
					Developmental:'Dev',
					Assessment:'Assess',
					Checkpoint:'Check',
					'Summative Assessment': 'Assess',
					'Culminating Experience':'Culm Exp',
					'Culminating-Experience':'Culm Exp',
				};
				const obj={
					lesson: 'Lesson '+lesson.number,
				};
				lesson.allStandards.forEach(standard=>{
					obj[standard.name]=standard.items.map(item=>{
						let title=item.name || item.title;
						if (item.progressions?.length){
							title+=' ('+item.progressions.map(pr=>progressions[pr.name] || pr.name).join(', ')+')';
						}
						if (item.items?.filter(sub=>sub.title).length){
							title+=' (';
							title+=item.items.filter(sub=>sub.title).map(subItem=>{
								return subItem.title.replace('Concept ', '').replace('.', '');
							}).join(', ');							
							title+=')';
						}	
						if (standard.name==='ccc' && item.items?.filter(sub=>sub.name).length){
							title=item.items[0].name;
						}
						return title;
					}).join(', ');
				});
				return obj;				
			})
		})
		
		
	
		blocks.push({
			type: 'h1',
			value: 'Materials List Information',
			headerTitle: PDFUtils.headerTitles.find(t=>t.titleLeft==='Materials'),
			startOnNewPage: true
		});
		blocks.push({
			type: 'contentsPush',
			title: 'Materials', 
			level: 1, 
			color: colors.black
		});

		const materialsSupLegenda=[
			{val: 1, text: 'items that students are encouraged to bring in from home'},
			{val: 2, text: 'items that will run out eventually'},
			{val: 3, text: 'replacement items in Green Ninja kit'},
			{val: 4, text: 'items included in Green Ninja kit'},
			{val: 5, text: 'optional materials'},
		];
	
		await processObjectFieldsIntoBlocks(model, [
			{title: '', field:'materials_desc'},
			{title: 'Safety Guidelines', field:'materials_safety_guidelines', headerType:'h1'},
		], blocks);
	
		//'materialLsKit', 'materialLsTeacher', 'materialLsOptional'
		//console.log('materials.materialLsKit', materials.materialLsKit);
		await asyncForEach([{
			title: 'Materials Provided by School/Teacher:',
			data: materials.materialLsTeacher,
			headerType: 'h1',
			startOnNewPage: true
		},
		{
			title: 'Optional Materials',
			data: materials.materialLsOptional,
			headerType: 'h2',
			hideSupscripts: 5,
		},
		{
			title: 'Materials in Green Ninja Kit:',
			data: materials.materialLsKit,
			headerType: 'h1',
			hideSupscripts: 4,
		}].filter(mat=>mat.data.length), async(mat)=>{
			//console.log(mat.data);
			blocks.push({
				type: mat.headerType || 'h2',
				value: mat.title
			});
			
	
			blocks.push({
				type: 'table',
				columns: [
					{
						id: 'name',
						header: 'Item',
						width: 120,
						dataValue: 'nameArr' 
						/*
						renderer: (tb, data) => {
							return data.nameArr;
						}
						*/
					},
					{
						id: 'quantity',
						header: 'Quantity',
						align: 'left',
						width: 60,
					},
					{
						id: 'lessons',
						header: 'Lessons',
						align: 'left',
						width: 80,
					},
					{
						id: 'alternative',
						header: 'Alternative',
						align: 'left',
						width: 100,
					},
					{
						id: 'notes',
						header: 'Note',
						align: 'left',
						width: 130,
					},
				],
				data: mat.data.map(item=>{
					const clonedItem=_.cloneDeep(item)
					if (mat.hideSupscripts){ 
						clonedItem.nameArr=clonedItem.nameArr.filter(nameItem=>{
							const features=nameItem.params?.features || [];
							//console.log('item.nameArr', features, nameItem, features.indexOf('sups')>=0, nameItem.text.trim()=='5');
							return !(features.indexOf('sups')>=0 && nameItem.text.trim()==mat.hideSupscripts)
						})
						
					}
					return clonedItem;
				})
			})

			//console.log(mat.data);
			const currentMarkers={};
			mat.data.forEach(item=>{
				(item.markers || []).forEach(m=>currentMarkers[m]=true);
			});
			const filteredLegena=materialsSupLegenda.filter(item=>currentMarkers[item.val] && (!mat.hideSupscripts || (mat.hideSupscripts && item.val!=mat.hideSupscripts)));
			const tableDescr=parse(
				filteredLegena.map((item, index)=>{
					return '<sup>'+item.val+'</sup> — '+item.text+(index < filteredLegena.length-1 ? '<br />\n' : '')
				}).join('')
			);
	
			await parseHTMLIntoBlocks(tableDescr, {
				stuckWithPrevious: true,
				fitToPage: true
			}, blocks);
			
		});
		
		//console.log(tableDescr);		
		//return;	
		
		await asyncForEach(unit.review, async (review)=>{
			/*
			blocks.push({
				type: 'h1',
				value: review.name,
				headerTitle: PDFUtils.headerTitles.find(t=>t.titleLeft==='Unit Resources'),
				startOnNewPage: true
			});
			await processObjectFieldsIntoBlocks(review, [
				{
					title: '', 
					field:'description', 
				},
			], blocks);
			blocks.push({
				type: 'contentsPush',
				title: 'Unit Resources', 
				level: 1, 
				color: colors.black
			});
			
			//console.log('review.activityPlan', review.activityPlan);
			const sortedPlan=_.sortBy(review.activityPlan.filter(p=>['Remote Learning', 'Unit Videos', 'Unit Video'].indexOf(p.title)<0), p=>p.header).filter(
				plan=>plan.content?.trim()
			);
			let planIndex=0;
			await asyncForEach(sortedPlan, async (plan)=>{
				const index=planIndex;
				const res=await processObjectFieldsIntoBlocks(plan, [
					{title: plan.title ? (index+1)+'. '+plan.title : plan.header, field:'content', params: {
						//removeFirstparagraphNum: (plan.title || plan.header)==='Additional Reading' ? 3 : 0,
						removeFirstparagraphNum: 0,
						replaceFn: (str)=>{
							const string=str.replace(new RegExp('\\(\\{\\{'+unit.unit_id+'\\}\\}([a-zA-Z0-9\-\.]+)\\)', 'igm'), (match, str, str1, str2)=>{					
								return ''+str+'';
							});
							return string.replace(/\(\(/g, '(').replace(/\)\)/g, ')');
						}
					}},
				], blocks);	
				if (res){
					planIndex++;
				}
				//console.log('sortedPlan', res)		
			});		
			//console.log(sortedPlan);
			*/
		});		
	
		
		allWorkShets.forEach(workshet=>{
			workshet.mentionedInLessonId=0;
		})
		//return;
		blocks.push({
			type: 'sectionCover',
			title: 'Lesson Guides',
			image: 'images/lesson-guides.jpg',
			color: colors.lessonGreen,
			addContents: true,
		});
	//	return;
		await asyncForEach(unit.chapters, async chapter=>{
			const chapterBadge={
				bageNum: chapter.number+1,
				text: 'Chapter '+chapter.number,
				color: chapterColors[chapter.number-1]
			};
			blocks.push({
				type: 'h1',
				value: 'Chapter Overview',
				headerTitle: {
					type: 'chapter',
					titleLeft: 'Chapter '+chapter.number,
					color: colors.lessonGreen,
					chapter,
					chapterBadge,
				},
				startOnRightSide: true,
				startOnNewPage: true,
				color: colors.lessonGreen,
				topIdent: 150
				/*
				blankPageTitle: {
					color: colors.lessonGreen,
				}*/
			});

			await processObjectFieldsIntoBlocks(chapter, [
				{title: '', field:'description'},
				/*
				{title: 'Phenomenon', field:'phenomenon', headerType:'h3', params: {
					marginTop: 0.5,
					//ident:100,
					//width: 350
					ulMarginTop: 0,
					marginBottom: -0.3
				}},
				{title: 'Learning Objectives', field:'objectives', headerType:'h3', params: {
					marginTop: 0.5,
					ulMarginTop: 0,
					marginBottom: -0.3
					//ident:100,
					//width: 350
				}},*/
			], blocks);
			
			blocks.push({
				type: 'contentsPush',
				title: 'Chapter '+chapter.number+': '+chapter.name, 
				level: 1, 
				color: colors.lessonGreen
			});

			blocks.push({
				type: 'custom',
				drawFn: (doc)=>{
					const iconWidth=48.5;
					const width=contentWidth-90;
					const leftIdent=textIdents.left+(iconWidth/2);
					const lessonNameLeftIdent=leftIdent+(iconWidth/2)+10;
					const height=chapter.lessons.length*16+23;
					doc.y+=10;
					const boxY=doc.y;
					

					doc
						  .save()
						  .lineWidth(1)
						  .roundedRect(leftIdent, doc.y, width, height, 10)   
						  .stroke(colors.lessonGreen);
					
					const svg=fs.readFileSync('images/icons/icon-lessons.svg', 'UTF-8')
					//.replace(/\#F05925/ig, colors.unitTitle)
					//.replace(/\#E8C3BC/ig, Color(colors.unitTitle).lighten(0.6).hex());
			  
					  doc
						  .addSVG(svg, textIdents.left+1, (boxY+height/2)-iconWidth/2, {
							  width: iconWidth,
							  //height: 525,				  
						  });
					
					doc.y+=10;

					chapter.lessons.forEach(chLesson=>{
						const lesson=lessons.find(lesson=>lesson.lesson_id===chLesson.lesson_id);
						const lessonTitle='Lesson '+lesson.number+' '+lesson.name;
						let lineY=doc.y+11;
						const y=doc.y;
						
						doc
							//.font(s.level0.font)
							//.fontSize(s.level0.fontSize)
							.fillColor('black')
							.text(lessonTitle, lessonNameLeftIdent, y, {
								align: 'left',
								//underline: s.level0.underline
							});

							const titleWidth=doc.widthOfString(lessonTitle, {
								font: fonts.regular,
								fontSize: 10
							});

							if (/*lesson.phenomenon || */lesson.hasPhenomenonFile){
								//phenomenon-green-small.png
								doc.image('images/icons/phenomenon-green-small.png', doc.x+titleWidth+3, y-2, {
									width: 15,
								});
							}

							if (lesson.pageNum){
								
								lineStart=doc.x+titleWidth+7+(lesson.hasPhenomenonFile ? 15 : 0);

								doc
								  .font(fonts.regular)
								  .fontSize(10)
								  .text(lesson.pageNum, lessonNameLeftIdent, y, {
									width: width-45,
									align: 'right'
								  });
								PDFUtils.drawCircleDotsLine(doc, lineStart, lineY, (width+68)-((lesson.pageNum+'').length*4)-lineStart, 0.5, 'black');
							}
						doc.y+=3;
					})
					doc.y+=20;
				}
			});	

			blocks.push({
				type: 'h1',
				value: 'Unit Roadmap',
				startOnRightSide: false,
				startOnNewPage: false,
				color: colors.lessonGreen,
				//topIdent: 150
				/*
				blankPageTitle: {
					color: colors.lessonGreen,
				}*/
			});

			//introduction_challenge_description

			if (unit.introduction_challenge_description){
				const challengeText=`<p><strong>Unit Challenge:</strong> ${unit.introduction_challenge_description}</p>`;
				await asyncForEach(parse(challengeText).childNodes, async (el)=>{
					await parseHTMLIntoBlocks(el, {}, blocks);
				});
			}
			
			const greenBox=chapter.greenBoxes.find(gb=>gb.name.trim()==='Connections to Unit Roadmap');
			if (greenBox){
				//console.log(greenBox);
				const slide=greenBox.slides[0];
				const path=await downloadFile(slide.imagePath);
				const imgInfo=await getImgInfoAndRotate(path);
				const imageWidth=contentWidth/2.5;
				
				let imageHeight=getImgPropheight(imgInfo, imageWidth, true);

				blocks.push({
					type: 'custom',
					drawFn: (doc)=>{
						const iconWidth=48.5;
						const width=contentWidth-90;
						const leftIdent=textIdents.left+(iconWidth/2);
						const textWidth=contentWidth-imageWidth-60;
						
						doc.y+=10;
						let y=doc.y;
						
						doc.image(path, leftIdent-30, y, {
							width: imageWidth,
						});

						const textHeight=doc
							.fontSize(10)
							.font(fonts.regular)
							.heightOfString(slide.description, {
								width: textWidth,
								align: 'left',
							});
						
						const root=parseHtml(slide.description);
						doc.y=y;
						
						if (imageHeight>textHeight){
							const margin=imageHeight/2-textHeight/2-20;
							if (margin>0){
								doc.y+=margin;
							}
							
							if (chapter.number==5){
								console.log({imageHeight,textHeight,imageWidth, path, margin, imgInfo})
							}
						}
						

						root.childNodes.forEach(node=>{
							PDFUtils.drawActions.p(doc, {
								value: node.childNodes,
								parentEl: node,
								isHtml:true,
								params: {
									//addSpaceAfterSize: 3,
									ident: imageWidth+15,
									width: textWidth,
								}
							})
						})
					}
				});	
			}

			blocks.push({
				type: 'h1',
				value: 'Reading Companion',
				headerTitle: {
					type: 'chapter',
					titleLeft: 'Chapter '+chapter.number,
					titleRight: 'Chapter Reading',
					color: colors.lessonGreen,
					chapter,
					chapterBadge,
				},
				//startOnRightSide: true,
				
				startOnNewPage: true,
				color: colors.lessonGreen,
				topIdent: 120,
				svgIcon: 'images/icons/icon-reading.svg'
				/*
				blankPageTitle: {
					color: colors.lessonGreen,
				}*/
			});
			//customPages.
			await asyncForEach(parse(customPages.Chapters['reading-companion']).childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el, {}, blocks);
			});

			//rc_pdf_worksheet
			const pathArr=chapter.rc_pdf_worksheet.split('/');
			const RCFile={
				fileName: pathArr[pathArr.length-1]
			};
			const RCpath=await downloadFile(chapter.rc_pdf_worksheet);
			const RCimgPaths=await convertPptxPdf(RCpath, RCFile);
			//console.log(RCimgPaths);
			const RCimgInfo=await getImgInfoAndRotate(RCimgPaths[0].imagePath);
			let RCimageWidth=230;
			if (RCimgPaths.length>2){
				RCimageWidth=160
			}
			
			let imageHeight=getImgPropheight(RCimgInfo, RCimageWidth);
			let imgX=textIdents.left+(contentWidth-50-(RCimgPaths.length*RCimageWidth))/2;
			if (imgX<textIdents.left){
				imgX=textIdents.left;
			}
			blocks.push({
				type: 'images',
				value: RCimgPaths.map(img=>{
					const image={
						path: img.imagePath,
						width: RCimageWidth,
						height: imageHeight,
						x: imgX
					}
					imgX+=RCimageWidth;
					if (imgX>500){
						imgX=textIdents.left;
					}
					return image;
				}),
				width: RCimageWidth,
				firstRowHeight: imageHeight,
				addBorder: true,
				borderColor:colors.lessonGreen,
				dontAttachParagraphToImage: true,
				marginTop: 30
			});

			await asyncForEach(chapter.lessons.filter((chLesson, i)=>{
				const l=lessons.find(lesson=>lesson.lesson_id===chLesson.lesson_id);
				//return i<13 && i>=11;
				//console.log(l.number, printLessonNum.split(',').indexOf(l.number), printLessonNum.split(','))
				return printLessonNum ? printLessonNum.split(',').indexOf(l.number)>=0 : true;
			}), async (chLesson)=>{
				const lesson=lessons.find(lesson=>lesson.lesson_id===chLesson.lesson_id);
				//console.log('lessonlesson', lesson);
				currentLessonIdGlobal=lesson.old_lesson_id;
				let header={
					titleLeft: 'Lesson '+lesson.number+' '+lesson.name, 
					titleRight: '', 
					icon: 'images/icons/Lesson Plan.png',
					color: colors.lessonGreen,
					chapterBadge,
				};
				
				PDFUtils.showedFiles=[];
				let worksheetFromAnotherLessons=[];
				
				const workshetReplaceFn=(str, params)=>{
					//console.log('forRegexp: ', str);
					let images=[];
					if (str.indexOf('15980')>0){
						//console.log('fuckfick', str);	
					}
					
					const string=(str || '').replace(/\(%([\d]+)%\)/igm, (match, str, str1, str2)=>{					
						//console.log('regexp2', match, str, str1);
						const workshet=allWorkShets.find(file=>file.worksheet_id==str);
						if (str==15980){
							//console.log('workshetReplaceFn', lesson.lesson_id, workshet.lesson_id, workshet);
						}
						
						let fromAnotherLesson=false;
						if (workshet){
							if (!workshet.isOnlineAccess){
								if (!params.readOnly){
									if (PDFUtils.showedFiles.indexOf(workshet.fileNameWithExt)<0){
										(workshet.images || []).forEach(img=>images.push(img));
									}
									if (workshet.images && workshet.images.length && !params.dontShowImagesAfter){
										PDFUtils.showedFiles.push(workshet.fileNameWithExt);
									}
								}
								fromAnotherLesson=workshet.lesson_id!==lesson.lesson_id;
								if (fromAnotherLesson && !worksheetFromAnotherLessons.find(w=>w.worksheet_id===workshet.worksheet_id)){
									console.log('workshetworkshet_worksheetFromAnotherLessons', workshet.fileNameWithExt);
									worksheetFromAnotherLessons.push(workshet);
								}
							}
							let referenceStr='';
							if (workshet.isOnline){
								referenceStr=customPages.messages.onlineContent;
							}
							else if (workshet.inlinePageRef){
								referenceStr=workshet.inlinePageRef;
							}
							else if (!workshet.inlinePageRef && images.length && !fromAnotherLesson && !params.dontShowImagesAfter){
								workshet.mentionedInLessonId=lesson.lesson_id;
								referenceStr='preview below';
							}
							else if (fromAnotherLesson && workshet.pageNum){
								referenceStr='preview on page '+workshet.pageNum;
							}
							else if (workshet.mentionedInLessonId!==lesson.lesson_id) {
								referenceStr='access online';
							}

							return workshet.fileTitle+(referenceStr ? ' ('+referenceStr+') ' : '');
						}
						return '';
					}).replace(/\) \(from /igm, '; from ').replace(/\( from /igm, '; from ').replace(/  /igm, ' ').replace(') (', '; ').replace(' )', ')').replace(' ,', ',').replace(' .', '.').replace('))', ')').replace('((', '(');
					if (string.indexOf('; from ')>0){
						images=[];
					}
					/*
					console.log({
						string,
						images
					})
					/**/
					//console.log({worksheetFromAnotherLessons})
					return {
						string,
						images
					};
				}
				//worksheetFromAnotherLessons=[];
				//This for files from another lessons array filing:
				['teacher_prep', 'list_materials'].forEach(field=>{
					workshetReplaceFn(lesson[field], {readOnly:true}).string;
				});
				lesson.activityPlan.filter(p=>!parseInt(p.student)).forEach(plan=>{
					//console.log('planItem!', plan);
					workshetReplaceFn(plan.content, {readOnly:true}).string;
				});
				['anticipated_challenges'].forEach(field=>{
					workshetReplaceFn(lesson[field], {readOnly:true}).string;
				});
				//console.log(lesson.number);
				//console.log('worksheetFromAnotherLessons', worksheetFromAnotherLessons)
				
				blocks.push({
					type: 'h1',
					value: 'Lesson Introduction',
					headerTitle: header,
					startOnRightSide: true,
					startOnNewPage: true,
					/*
					blankPageTitle: {
						color: colors.lessonGreen,
					}*/
				});
				blocks.push({
					type: 'setObjectPageNum',
					value: lesson,
				});
				
				/*
				if (lesson.phenomenon){
					blocks.push({
						type: 'introductions',
						value:[
							{title: 'Unit Challenge', field:'phenomenon'},
						],
						color: 'black',
						fontSize: 10,
						paddingBottom: 0.5,
						titleFont: fonts.bold,
						moveDown: 0,
						data: lesson
					});
				}
				*/
				
				
			
				await processObjectFieldsIntoBlocks(lesson, [
					{title: '', field:'description'},
					{title: 'Phenomenon', field:'phenomenon', headerType:'h3', params: {
						marginTop: 0.5,
						//ident:100,
						//width: 350
						ulMarginTop: 0,
						marginBottom: -0.3
					}},
					{title: 'Lesson Activities', field:'objectives', headerType:'h3', params: {
						marginTop: 0.5,
						ulMarginTop: 0,
						marginBottom: -0.3
						//ident:100,
						//width: 350
					}},
				], blocks);
				
				blocks.push({
					type: 'contentsPush',
					title: 'Lesson '+lesson.number+' '+lesson.name, 
					level: 2, 
					color: colors.black
				});
				
				
				blocks.push({
					type: 'h1',
					value: 'Teaching Resources'
				});	
				
				//console.log('lesson.worksheet', lesson.number, lesson.worksheet);
				//console.log('worksheetFromAnotherLessons', worksheetFromAnotherLessons);
				if (lesson.worksheet.length || worksheetFromAnotherLessons.length){
					
					blocks.push({
						type: 'h2',
						value: 'Files'
					});
					const excludes=[
						(file)=>file.type==='pdf' && file.originalFileName.indexOf('-presentation.')>0,
						(file)=>{
							const found=lesson.worksheet.find(ws=>ws.originalFileName.replace('.pptx', '')===file.originalFileName.replace('.pdf', ''));
							if (found){
								console.log('foundfound', found);
							}
							return found && file.type==='pdf';
						},
					];
					const lessonFiles=lesson.worksheet.filter((file, index)=>{
						const existing=lesson.worksheet.find((f, i)=>f.originalFileName===file.originalFileName && i < index);
						return !existing && !excludes.find(fn=>fn(file));
					});
					//console.log('lessonFiles', lessonFiles);
					worksheetFromAnotherLessons.forEach(file=>{
						lessonFiles.push(file);					
					});
					let hasOnlineIcons=!!lessonFiles.find(f=>f.isOnline);
					const hasStudenIcon=data=>(data.for_student || data.fileTitle.indexOf('phenomenon.pdf')>0) && data.type==='pdf';
					let hasStudentIcons=!!lessonFiles.find(f=>hasStudenIcon(f));
				
					blocks.push({
						type: 'table',
						fontSize: 10,
						hideHeaders: false,
						borderColor: '#929497',
						headerBorderColor: '#929497',
						headerColor: 'white',
						headerFill: '#c2c3c4',
						headerPadding: 7,
						//leftIdent: 80,
						columns: [
							{
								id: 'fileTitle',
								header: 'Files Name',
								width: 320,
								align: 'left',
								padding: [4,10,4,4],
								renderer: function (tb, data) {	
									let str=data.fileTitle;							
									if (data.lesson_id!==lesson.lesson_id){
										const fileLesson=lessons.find(l=>l.lesson_id===data.lesson_id);
										//console.log('fileLesson', fileLesson);
										if (fileLesson){
											str+='  (from Lesson '+fileLesson.number+' '+fileLesson.name+')';
										}
									}
									return str;
								},
								/*
								cellAdded: (tb, data, cell, pos)=>{
									//console.log(tb, data);
									if (data.isOnline){
										const doc=tb.pdf;
										const textWidth=doc.widthOfString(data.fileTitle);
										let x=pos.x+(textWidth<280 ? textWidth : 270);
										let strNum=parseInt(textWidth/270);
										doc.image('images/icons/noun_Refresh_1299685.png', x, pos.y-30-(1*strNum), {
											width: 30,
											align: 'center',
											valign: 'center'
										});
									}								
								}
								*/

							},
							{
								id: 'page',
								header: 'File Preview',
								width: 155,
								renderer: function (tb, data) {								
									return data.page || (!hasStudenIcon(data) ? 'Access Online' : '');
								},
								cellAdded: (tb, data, cell, pos)=>{
									const doc=tb.pdf;
									const textWidth=doc.widthOfString(data.page || '');
									let x=pos.x+textWidth;
									if (!data.page){
										x-=4;
									}
									//console.log(pos);
									if (data.isOnline){
										doc.image(icons.onlineContent, x, pos.baseY-3, {
											width: 20,
											align: 'center',
											valign: 'center'
										});
									}	
									if (hasStudenIcon(data)){
										doc.image(icons.studentContent, x, pos.baseY-3, {
											width: 20,
											align: 'center',
											valign: 'center'
										});
									}								
								}
							},
						],
						data: _.sortBy(lessonFiles, f=>f.fileTitle),
						/*
						dataFilter: (data)=>{
							//console.log('PDFUtils.pdfGenIterator', PDFUtils.pdfGenIterator, data.map(file=>[file.fileName, file.page]));
							return data.filter(file=>!PDFUtils.pdfGenIterator || (PDFUtils.pdfGenIterator>0 && file.page));
						}*/
					});
					lesson.worksheet.forEach(file=>{
						if (!unit.files.find(f=>f.fileName===file.fileName)){
							unit.files.push(file);
						}
					});
					const legenda=[
						{icon: icons.onlineContent, text: customPages.messages.onlineContentAfterTableDescription, visible: hasOnlineIcons},
						{icon: icons.studentContent, text: customPages.messages.studentContent, visible: hasStudentIcons},
					]
					if (legenda.filter(l=>l.visible).length){
						blocks.push({
							type: 'custom',
							drawFn: (doc)=>{
								let y=doc.y-10;
								legenda.filter(l=>l.visible).forEach(item=>{
									const x=textIdents.left-5;
								
									doc.image(item.icon, x, y, {
										width: 25,
										align: 'center',
										valign: 'center'
									});
									doc
									.font(fonts.regular)
									.fontSize(9)
									.fill('black')
									.text('— '+item.text, x+23, y+5);
									//doc.moveDown(item.marginBottom || 0.2);
									y+=20;
								});
								doc.moveDown(1);
							}
						});	
					}
				}
				//return;
				
				await processObjectFieldsIntoBlocks(lesson, [
					{title: 'Links', field:'links', headerType:'h2', params: {
						marginBottom: 0.1
					}},
				], blocks);
			
				if (lesson.materials.length || lesson.previousLessonMaterials){
					blocks.push({
						type: 'h2',
						value: 'Materials',
						/*
						headerTitle: {
							titleLeft: 'Lesson Prep', 
							titleRight: 'Lesson '+lesson.number, 
							icon: 'images/icons/Lesson Plan.png',
							color: colors.lessonGreen
						},*/
						//paddingBottom: 0.1
					});
					//previousLessonMaterials
					await processObjectFieldsIntoBlocks(lesson, [
						{title: '', field:'previousLessonMaterials'},
					], blocks);
					
				}			
			
				const lessonMaterials = [];
				materialDataRaw.filter(m=>m.lesson_id===lesson.lesson_id).map((material) => {
					const totalQuantity = parseInt(material.quantity, 10);
					const balance = material.reusableInd === 0 ? 0 : totalQuantity;
					const materialToAdd = {
						material,
						totalQuantity,
						balance
					}
					if (!lessonMaterials.some((obj) => obj.material.material_id === material.material_id)) {
						lessonMaterials.push(materialToAdd);
					} else {
						const existingMaterial = lessonMaterials.find(
						(obj) => obj.material.material_id === material.material_id
						);
						if (material.reusableInd === 1) {
						if (material.balance === 0) {
							material.balance = totalQuantity;
							existingMaterial.totalQuantity += parseInt(totalQuantity, 10);
						} else if (material.balance > 0) {
							if (material.balance <= totalQuantity) {
							existingMaterial.totalQuantity += parseInt(totalQuantity, 10) - parseInt(material.balance, 10);
							material.balance = totalQuantity;
							}
						}
						} else if (material.balance > 0) {
						if (totalQuantity >= material.balance) {
							existingMaterial.totalQuantity += parseInt(totalQuantity, 10) - parseInt(material.balance, 10);
							material.balance = 0;
						} else {
							material.balance = parseInt(material.balance, 10) - parseInt(totalQuantity, 10);
						}
						} else {
						existingMaterial.totalQuantity += parseInt(totalQuantity, 10);
						material.balance = 0;
						}
					}
					})
				const lessonMaterialLegenda=[];
				const materialGroups=[];//For each pair of students
				[
					{
						forWhomInd: 0,
						title: 'For the teacher',	
					},
					{
						forWhomInd: 3,
						title: 'For the class',	
					},
					{
						forWhomInd: 2,
						title: '',	
					},
					{
						forWhomInd: 1,
						title: 'For each student',	
					},
					
				].forEach(({title, forWhomInd})=>{
					let materials=lessonMaterials.map(m=>m.material).filter(item=>(item.plural_name || item.name) && item.forWhomInd==forWhomInd);
					//console.log('materialsmaterials', title, materials);
					if (forWhomInd!=2){
						materialGroups.push({
							title,
							materials
						});
					}
					else {
						materials=materials.filter(m=>!materials.find(mm=>mm.material_id===m.material_id && mm.group_size>m.group_size));
						[
							...[...Array(30).keys()].filter(i=>i>2).reverse().map(i=>{
								return {
									val: i,
									title: 'For each group of '+i+' students',	
								};
							}),
							{
								val: 2,
								title: 'For each pair of students',	
							},
							{
								val: 1,
								title: 'For each student',	
							},
						].forEach(item=>{
							//console.log('Arr intem', item);
							const stGroupMaterials=materials.filter(m=>m.group_size==item.val);
							materialGroups.push({
								title:item.title,
								materials: stGroupMaterials
							})
						})
					}
				})
				//console.log('materialGroups', materialGroups);
				materialGroups.forEach(({title, materials})=>{
					//console.log('materialGroups!!!!', title, materials);

					if (materials.length){
						
						blocks.push({
							type: 'h3',
							value: title,
						});
						materialsArr=materials.map(item=>{
							//console.log(item);
							let nameStr='';
							let quantity=parseFloat(item.quantity);
							const nameArr=processMaterialItemName(item, quantity);
							let sups='';
							if (nameArr){
									nameArr.forEach(t=>{
									let tag='span';
									if (t.params && t.params.features && t.params.features.indexOf('sups')>=0){
										tag='sup';
										if (lessonMaterialLegenda.indexOf(t.text)<0){
											lessonMaterialLegenda.push(t.text);
										}
										sups+='<'+tag+'>'+t.text+'</'+tag+'>';
									}
									else {
										nameStr+='<'+tag+'>'+t.text+'</'+tag+'>';
									}
									
								})
							}
							else {
								nameStr=item.name;
							}
							
							//(quantity ? parseFloat(quantity)+' - ' : '')
							if (quantity){
								//console.log('lessonMaterial', item);
								if (item.plural_quantity_unit && item.quantity_unit){
									quantity+=' '+(parseInt(quantity) > 1 ? item.plural_quantity_unit : item.quantity_unit);
								}
								quantity+=' - ';
							}
							else {
								quantity='';
							}
							if (sups){
								//console.log('supsItem', sups, item);
							}
							return {
								matName: nameStr.replace('\n', ' '),
								name: quantity + nameStr.replace('\n', ' ') + sups,
								sups,
								lesson_material_order: item.lesson_material_order,
								optionalInd: item.optionalInd,
								addons: [
									{
										label:'Alternative',
										field: 'alternative'
									},
									{
										label:'Notes',
										field: 'notes'
									},
								].filter(a=>item[a.field]).map(a=>a.label+': '+item[a.field])
							};
						});
						let listHtml='<ul>';
						_.sortBy(materialsArr, m=>m.lesson_material_order/*!!m.optionalInd*/).forEach(m=>{
							listHtml+='<li>'+m.name;
							if (m.addons.length){
								listHtml+='<ul>';
								m.addons.forEach(a=>{
									listHtml+='<li>'+a+'</li>';
								});
								listHtml+='</ul>';
							}
							listHtml+='</li>';
							
						});
						listHtml+='</ul>';
						//console.log(materialsArr);
						blocks.push({
							type: 'list',
							html: listHtml,
							childUlIdent: 15,
							ulMarginTop: 0.001,
							childUlAddSpaceAfterSize: -0.0000000001,
							//addSpaceAfter: false
						});
					}
				})
				if (lessonMaterialLegenda && lessonMaterialLegenda.length){
					const lessonMaterialLegendaItems=materialsSupLegenda.filter(item=>lessonMaterialLegenda.find(id=>id==item.val));
					const tableDescr=parse(
						lessonMaterialLegendaItems.map((item, i)=>{
							return '<sup>'+item.val+'</sup> — '+item.text+(lessonMaterialLegendaItems.length !=i+1 ? '<br />' : '');
						}).join('')
					);

					await parseHTMLIntoBlocks(tableDescr, {}, blocks);
				}
				
			
				await processObjectFieldsIntoBlocks(lesson, [
					{title: 'Teacher Prep', field:'teacher_prep', 
						headerType:'h1',
						
						params: {
							listsIdent: 13,
							replaceFn: workshetReplaceFn,
							notShowTitleWhenParagraphBreaks: true,
							dontShowImagesAfter: true,
							imgParams: {
								align: 'center',
								maxHeight: 300
							}
						},
					},
				], blocks);

				await processObjectFieldsIntoBlocks({
					sequence: `<p className='para-text'>This is the suggested sequence of learning activities for this lesson. Note that session times are estimates. Depending on students' progress, the sessions may be shorter or longer.</p>`
				}, [
					{title: 'Lesson Plan', field:'sequence', 
						headerType:'h1',
						params: {
							paddingBottom: 0.2
						},
					},
				], blocks);
				blocks.push({
					type: 'line',
					showOnTopOfThePage: false,
				});
				//return;
			
				
			
				let planTotalTime=0;
				const proceedFile=async (file)=>{
					//showedFiles.push(file.fileNameWithExt);
					const path=await downloadFile(file.path);
					if (file.type==='pdf'){
						const imgPaths=await convertPptxPdf(path, file);
						//const imgPaths=await convertPdf(path);
						//console.log(imgPaths);
						let x=textIdents.left;
						const images=[];
						/*
						const width=imgPaths.length > 1 ? 232 : 400;
						if (imgPaths.length === 1){
							x+=25;
						}
						*/
						let width=185;
						if (imgPaths.length>2){
							width=160;
						}
						
						await asyncForEach(imgPaths, async (item, imgIndex)=>{
							const imgInfo=await getImgInfoAndRotate(item.imagePath);
							//console.log(item.imagePath, imgInfo);
							if (file.isOnline && imgIndex > 0){
								return;
							}
							if (imgInfo.rotated && imgInfo.rotatedPath && 0){
								width=232;
								const w=imgInfo.width;
								imgInfo.width=imgInfo.height;
								imgInfo.height=w;
							}
							if ((x+width)>200){
								x=textIdents.left;
							}
							let height=getImgPropheight(imgInfo, width);
							images.push({
								path: imgInfo.rotated && imgInfo.rotatedPath ? imgInfo.rotatedPath : item.imagePath,
								height,  
								width,
								x,
								imgInfo,
								file,
								highlight: imgIndex===0 && file.isOnline ? {
									color: colors.orange,
									icon: icons.onlineContent
								} : null,
							})
							x+=width;
							
						});
						//console.log({images, imgPaths});
						file.images=[{
							type: 'images',
							value: images,
							width: width,
							firstRowHeight: images[0].height,
							addBorder: true,
							dontAttachParagraphToImage: false,
							file,
						}];
						//console.log('FILEFILE', file);
					}
					if (file.type==='pptx'){
						const pptData=await convertPptxPdf(path, file);
						//console.log(pptData);
						file.images=[];
						await asyncForEach(file.isOnline ? [pptData[0]] : pptData, async (item, index)=>{
							const imgInfo=await imageInfo(item.imagePath);
							file.images.push({
								type: 'pptSlide',
								value: item,
								file,
								hideLabels: file.isOnline,
								imgInfo,
								firstRowHeight: getImgPropheight(imgInfo, 170),
								dontAttachParagraphToImage: false,
								highlight: file.isOnline && index===0 ? {
									color: colors.orange,
									icon: icons.onlineContent
								} : null,
							});
						});
					}
				}
				
				await asyncForEach(lesson.files, async (file)=>{
					await proceedFile(file);
				});
				//console.log('activityPlan', lesson.activityPlan);
				const lessonPlanItems=lesson.activityPlan.filter(p=>!parseInt(p.student));
				await asyncForEach(lessonPlanItems, async (plan, planIndex)=>{
					//console.log(plan);
					await asyncForEach(plan.files, async (file)=>{
						await proceedFile(file);
					});
					await processObjectFieldsIntoBlocks(plan, [
						{
							title: plan.number+'. '+plan.title.trim(), 
							field:'content', 
							titleRight: '~ '+plan.time, 
							headerType: 'lessonPlanHeader',
							params: {
								resetCurentH2: true,
								replaceFn: workshetReplaceFn,
								processListsAsBlocks: true,
								ulMarginTop: 7,
								planIndex,
								imgParams: {
									width: 155,
									align: 'center',
									maxHeight: 350
								}
							}
						},
					], blocks);
					if (planIndex+1<lessonPlanItems.length){
						blocks.push({
							type: 'line',
							showOnTopOfThePage: false,
						});
					}
					planTotalTime+=parseInt(plan.time);
				});
				if (planTotalTime){
					if (planTotalTime<45){
						planTotalTime=45;
					}
					blocks.push({
						type: 'lessonPlanHeader',
						isTotalTile: true,
						value: 'Total Time', 
						rightText: '~ '+planTotalTime+' minutes',
						planIndex:100500,
						moveDownAfter: 0.001,
						addTopLine: true,
						addBottomLine: true,
					});
				}
				
				await processObjectFieldsIntoBlocks(lesson, [
					{
						title: 'Teacher Tips', 
						field:'anticipated_challenges',
						headerType: 'h1',
						params: {
							replaceFn: workshetReplaceFn,
							dontShowImagesAfter: true,
							imgParams: {
								width: 390,
								align: 'center',
								maxHeight: 300
							}
						}
					},
				], blocks);

				const backgroundForTeachersBlocks=[
					{title: 'Content Knowledge', field:'background', headerType: 'h2',
						params: {
							replaceFn: workshetReplaceFn,
							imgParams: {
								width: 350,
								align: 'center',
								maxHeight: 300
								//fitToPage: true,
							}
						}
					},
					{title: 'Access and Equity', field:'access_equity', headerType: 'h2', 
						params: {
							replaceFn: workshetReplaceFn
						}
					},
					{title: 'Home to School Connections', field:'home_to_school', headerType: 'h2', 
						params: {
							replaceFn: workshetReplaceFn
						}
					},
					{title: 'Student Prior Experience', field:'prior_experience', headerType: 'h2', 
						params: {
							replaceFn: workshetReplaceFn
						}},
					{title: 'Student Preconceptions', field:'student_preconceptions', headerType: 'h2', 
						params: {
							replaceFn: workshetReplaceFn
						}
					},
				];
				if (backgroundForTeachersBlocks.find(bl=>lesson[bl.field])){
					blocks.push({
						type: 'h1',
						value: 'Background for Teachers',
					});
					await processObjectFieldsIntoBlocks(lesson, backgroundForTeachersBlocks, blocks);
				}
				//console.log('lesson.pe', lesson.pe);
				//return;
				const lessonStandards=lesson.standards.find(st=>st.name==='pe');

				/*
				const otherStandards=[
					{
						type:'pe',
						title: 'Performance Expectation(s)'
					},
					{
						type:'sep',
						title: 'Science and Engineering Practice(s)'
					},
					{
						type:'dci',
						title: 'Disciplinary Core Idea(s)'
					},
					{
						type:'ccc',
						title: 'Crosscutting Concept(s)'
					},
				];
				otherStandards.forEach(st=>{
					st.items=_.values(_.groupBy((lesson[st.type] || []).filter(item=>item.orphan), item=>item.title+item.description)).map(items=>items[0]);
				})*/

				if (lessonStandards?.items?.length || lesson.orphanStandards.find(st=>st.items.length)){
					blocks.push({
						type: 'h1',
						value: 'Standards',
						paddingBottom: 0.2
					})
					if (lesson.ngss_description?.trim()){
						await asyncForEach(parse(lesson.ngss_description).childNodes, async (el)=>{
							await parseHTMLIntoBlocks(el, {
								params: {
									replaceFn: workshetReplaceFn,
								},
							}, blocks);
						});
					}
				}
				
				//console.log('lessonStandards', lessonStandards);
				if (lessonStandards?.items?.length && lesson.performanceExpectations.standards[0]?.items){
					
					blocks.push({
						type: 'h2',
						value: 'NGSS Standards',
						paddingBottom: 0.2
					})
		
					blocks.push({
						type: 'table',
						fontSize: 10,
						padding: 7,
						marginTop: lesson.ngss_description?.trim() ? 6 : 0,
						columns: [
							{
								id: 'title',
								header: 'Performance Expectation(s)',
								width: 155,
								align: 'left',
							},
							{
								id: 'progressions',
								header: 'Progression',
								width: 155,
								align: 'left',
								renderer: function (tb, data) {	
									let str=data.progressions.map(p=>p.name).join(', ');							
									return str;
								},
							},
							{
								id: 'lessons',
								header: 'Lessons building to PE(s)',
								width: 155,
								align: 'left',
								renderer: function (tb, data) {	
									let str=_.sortBy(data.lessonIds.map(id=>lessons.find(l=>l.lesson_id==id)).filter(l=>l/* && l.lesson_id!==lesson.lesson_id*/), l=>l.index).map(l=>l.number).join(', ');							
									return str;
								},
							},
						],
						data: lesson.performanceExpectations.standards[0]?.items || []
					});
					//console.log('lesson.pe', lessonStandards.items);
				}
				
				//return;

				const orphanItems=[
					{
						items:lesson.orphanStandards.find(st=>st.name==='pe')?.items || [],
						name:"PERFORMANCE EXPECTATIONS",
					},
					{
					  items:lesson.orphanStandards.find(st=>st.name==='sep')?.items || [],
					  name:"SCIENCE AND ENGINEERING PRACTICES",
					},
					{
						items:lesson.orphanStandards.find(st=>st.name==='dci')?.items || [],
					  name:"DISCIPLINARY CORE IDEAS",
					},
					{
						items:(lesson.orphanStandards.find(st=>st.name==='ccc')?.items || []).filter(item=>item.items.filter(item=>!item.items || !item.items.length).length),
					  name:"CROSSCUTTING CONCEPTS",
					},
					{
					  items:(lesson.orphanStandards.find(st=>st.name==='ccc')?.items || []).filter(item=>!item.items.filter(item=>!item.items || !item.items.length).length),
					  name:"",
					  byCategory: true,
					},
				];
			
				if (orphanItems.find(st=>st.items.length)){
					blocks.push({
						type: 'h3',
						value: 'Connections to Other NGSS Standards',
						font: fonts.bold,
						ident: 0,
						marginTop: 0,
						moveToNextPageIfNotFit: true,
					});
					let cccHtml='';
					//cccHtml+='<p><strong>Connections to Other NGSS Standards</strong></p>';
					cccHtml+='<p>The below PE(s), SEP(s), DCI(s), and CCC(s) are emphasized in this lesson but are not associated with the above PE(s).</p>';
					//cccHtml+='<p>Crosscutting Concept(s)</p>';				
					await asyncForEach(parse(cccHtml).childNodes, async (el)=>{
						await parseHTMLIntoBlocks(el, {}, blocks);
					});
					
					await asyncForEach(orphanItems.filter(st=>st.items.length), async (st)=>{
						if (st.name){
							blocks.push({
								type: 'p',
								value: st.name,
								isHtml:false,
								font:fonts.regular,
								ident: 0,
								marginTop: 0.0001,
								isTitle:false,
								marginBottom: 0.0000000001
							});

							let itemListsHtml='<ul>';
						
							st.items.forEach(item=>{
								//console.log('Lesson_'+st.type, item);
								itemListsHtml+='<li>'+item.title;
								if (item.description){
									itemListsHtml+='<ul><li>'+item.description+'</li></ul>';
								}
								else if (item.items) {
									itemListsHtml+='<ul>';
										item.items.forEach(item=>{
											if (item.description){
												itemListsHtml+='<li>'+item.description+'</li>';
											}
										})
									itemListsHtml+='</ul>';
								}
								
								itemListsHtml+='</li>';
							});
							itemListsHtml+='</ul>'
							
							await asyncForEach(parse(itemListsHtml).childNodes, async (el)=>{
								await parseHTMLIntoBlocks(el, {
									ulMarginTop: 0,
								}, blocks);
							});
						}
						else {
							await asyncForEach(st.items, async st=>{
								blocks.push({
									type: 'p',
									value: st.title,
									isHtml:false,
									font:fonts.boldItalic,
									ident: 0,
									marginTop: 0.0001,
									isTitle:false,
									marginBottom: 0.0000000001
								});
	
								let itemListsHtml='<ul>';
							
								st.items.forEach(item=>{
									//console.log('Lesson_'+st.type, item);
									itemListsHtml+='<li>'+(item.title || item.name);
										itemListsHtml+='<ul>';
											item.items.forEach(item=>{
												if (item.description){
													itemListsHtml+='<li>'+item.description+'</li>';
												}
											})
										itemListsHtml+='</ul>';
									itemListsHtml+='</li>';
								});
								itemListsHtml+='</ul>'
								
								await asyncForEach(parse(itemListsHtml).childNodes, async (el)=>{
									await parseHTMLIntoBlocks(el, {
										ulMarginTop: 0,
									}, blocks);
								});
							})
							
						}
						
						
						
					});
				}
				
				/*
				const commonCoreStandards=[
					{title: 'COMMON CORE - ELA/Literacy', field:'ccl'},
					{title: 'COMMON CORE - Mathematics', field:'ccm'},
					{title: 'CA ELD', field:'eld'}
				];
				commonCoreStandards.forEach(st=>{
					st.items=lesson[st.field] || [];
				})
				*/
				const lessonCCStandards=lesson.standards.find(st=>st.name==='cc');
				
				
				if (lessonCCStandards?.items?.length){
					blocks.push({
						type: 'h2',
						value: 'Common Core and CA ELD Standards',
						//marginTop: 0.001,
						paddingBottom: 0.0001
					});
					await processObjectFieldsIntoBlocks(lesson, [
						{title: '', field:'common_core'},
					], blocks);
			
					lessonCCStandards.items.forEach((st, index)=>{
						if (st.items.length){
							//console.log('st.items', st.items);
							blocks.push({
								type: 'h3',
								value: st.title,
								font: fonts.regular,
								marginTop: index > 0 || lesson.common_core ? 0.8 : 0.0001,
								isHtml:false,
								isTitle: true
							});
							let html='<ul>';
							st.items.forEach(item=>{
								html+='<li>'+item.title+'<ul><li>'+item.description+'</li></ul></li>';
							});
							html+='</ul>';
			
							blocks.push({
								type: 'list',
								html,
								ident: 20,
								notMoveDownAfter: index+1 < lessonCCStandards.length ? true : false
							});
						}
					});
				}
				//epc
				//return;
				const lessonEpc=lesson.standards.find(st=>st.name==='epc');
				if (lessonEpc && lessonEpc.items.length){
					//console.log('lesson.epc', lesson.epc);
					
					blocks.push({
						type: 'h2',
						value: "California's Environmental Principles and Concepts",
						//marginTop: 0.001,
						paddingBottom: 0.0001,
						moveToNextPageIfNotFit: true
					});
					await asyncForEach(lessonEpc.items, async (item)=>{
						const concepts=item.items;
						await asyncForEach(parse('<p><strong>'+item.title+'</strong><br/>'+item.description+'</p>').childNodes, async (el)=>{
							await parseHTMLIntoBlocks(el, {
								ident: 0,
							}, blocks);
						});
						//concepts 18, 22

						concepts.forEach((st, index)=>{
							blocks.push({
								type: 'p',
								value: st.title,
								font: fonts.regular,
								marginTop: 0.8,
								isHtml:false,
								isTitle: false,
								leftTextIdent: 30
							});
							let html='<ul>';
							html+='<li>'+st.description+'</li>';
							html+='</ul>';

							blocks.push({
								type: 'list',
								html,
								ident: 20,
								marginTop:0.000001,
								ulMarginTop:0.000001,
								notMoveDownAfter: false
							});
						});
					})
					//const item=lesson.epc[0];
					
					
					
					/*
					blocks.push({
						type: 'list',
						value: st.items.map(item=>item.title),
						ident: 20,
						notMoveDownAfter: index+1 < lessonCCStandards.length ? true : false
					});
					*/
				}

				
				
			
				if (lesson.vocab && lesson.vocab.length){
					blocks.push({
						type: 'h1',
						value: 'Vocabulary',
						//marginTop: 0.001
					});
					
					let vocabHtml='';
					lesson.vocab.forEach(item=>{
						vocabHtml+='<p><strong>'+item.word+'</strong> - '+item.definition+'</p>';
					})				
					await asyncForEach(parse(vocabHtml).childNodes, async (el)=>{
						await parseHTMLIntoBlocks(el, {
							ident: 0,
						}, blocks);
					});
				}
				
				await processObjectFieldsIntoBlocks(lesson, [
					{title: 'Tying It All Together', field:'all_together', headerType: 'h1', params: { 
						replaceFn: (str)=>workshetReplaceFn(PDFUtils.convertHtml(str, lesson.old_lesson_id), {
							dontShowImagesAfter: true
						}),
						dontShowImagesAfter: true,
					}},
					{title: 'Safety Guidelines', field:'safety_guidelines', headerType: 'h1', params: { 
						replaceFn: (str)=>workshetReplaceFn(PDFUtils.convertHtml(str, lesson.old_lesson_id), {
							dontShowImagesAfter: true
						}),
						dontShowImagesAfter: true,
					}},
					{title: 'Extension', field:'extensions', headerType: 'h1', params: { 
						replaceFn: (str)=>workshetReplaceFn(PDFUtils.convertHtml(str, lesson.old_lesson_id), {
							dontShowImagesAfter: true
						}),
						dontShowImagesAfter: true,
					}},
				], blocks);
			
				
				
				/*
				
				*/
			
			
			
			
				if (lesson.number==='1.6'){

				}
			
			});
			//currentLessonIdGlobal=0;
		});
		//return; 
		/*
		blocks.push({
			type: 'sectionCover',
			title: 'Lesson Files',
			image: 'images/lesson-files.jpg',
			color: colors.lessonFiles,
			addContents: true,
		});
		blocks.push({
			type: 'pageBreak',
		});
		let currLessonId;
		await asyncForEach(unit.files.filter(file=>{
			const lesson=lessons.find(l=>l.lesson_id===file.lesson_id);
			return file.type==='pdf'
				&& lesson
				&& (printLessonNum ? printLessonNum.split(',').indexOf(lesson.number)>=0 : true)
				&& !file.isOnlineAccess
				&& !file.isOnline
				//&& !file.for_student
			;
		}), async (file)=>{
			let contentsObj;
			if (currLessonId!==file.lesson_id){
				const lesson=lessons.find(l=>l.lesson_id===file.lesson_id);
				if (lesson){
					contentsObj={
						title: 'Lesson '+lesson.number+' '+lesson.name+' Files', 
						level: 1, 
						color: colors.black
					}
					currLessonId=file.lesson_id;
				}
				
			}
			const path=await downloadFile(file.path);
			const imgPaths=await convertPptxPdf(path, file);
			//const imgPaths=await convertPdf(path);
			//console.log(imgPaths);
			let x=textIdents.left;
			const images=[];
			const width=465;

			await asyncForEach(imgPaths, async (item)=>{
				const imgInfo=await getImgInfoAndRotate(item.imagePath);
				images.push({
					path: imgInfo.rotated && imgInfo.rotatedPath ? imgInfo.rotatedPath : item.imagePath,
					height: getImgPropheight(imgInfo, width),
					rotated: imgInfo.rotated,
					width,
					x
				})
				x+=width;
				if (x>390){
					x=textIdents.left;
				}
			});
			
			if (images && images.length && images[0]){
				const width=images[0].rotated ? 590 : 612
				blocks.push({
					type: 'lessonFiles',
					value: images,
					file,
					contentsObj,
					leftIdent: (612-width)/2,
					width,
					bottomBoxY: images[0].rotated ? 745 : 735,
					rightBoxX: images[0].rotated ? 548 : 600,
					leftBoxWidth: 0,
				});
			}
		});
		*/
		
	}	
	//5.25, 5.21
	console.log('Preparing content blocks...');
	await generateBlocks();
	console.log('Created '+blocks.length+' blocks');
	
	console.log('Generating temp PDF file...');
	for (let i=0; i<5; i++){
		PDFUtils.generatePdf('temp.pdf', blocks);
		console.log('PDFUtils.wrongPageReferencing', PDFUtils.wrongPageReferencing);
	}	
	
	//G6U2, G8U1, G6U6, G7U6, G7U1
	//PDFUtils.generatePdf('temp.pdf', blocks, false);
	try {
		fs.unlinkSync('./temp.pdf');
	}
	catch(err){
		console.log(err);
	}
	
	const pdfFileName=argv.destPath || 'TC '+model.display_name+' Unit '+unit.number+'.pdf';
	console.log('Generating publication PDF '+pdfFileName+'...');
	//PDFUtils.generatePdf('output.pdf', blocks);
	PDFUtils.generatePdf(pdfFileName, blocks, true, disableImages ? true : false);
	const queueData=loadQueue();
	const queueItem=(queueData || []).find(item=>item.id===queueItemId);
	if (queueItem){
		queueItem.totalPageNumber=PDFUtils.totalPageNumber;
		//console.log('queueItem', queueItem);
		saveQueue(queueData);
	}
	if (notFoundWorksheets.length){
		const json2csvParser = new Json2csvParser({
			fields: Object.keys(notFoundWorksheets[0]),
			header: true
		});
		
		const csv = json2csvParser.parse(notFoundWorksheets).toString('utf-8').replace(/’/g, '`');
	
		fs.writeFileSync(`./found-content-issues/missing_worksheets_G${model.display_name.replace('Grade ', '')}U${unit.number}.csv`, csv, 'utf-8');
	}
}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})