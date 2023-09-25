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
					//console.log('planWorksheet', workshet);					
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

	PDFUtils.writeHeader=(doc, header, pageNum)=>{
		if (!header){
			return;
		}			
		header.titleLeft=model.display_name+' Unit '+unit.number;
		const titleLeftHeight=doc
			.fontSize(header.titleLeftFontSize || 16)
			.font(PDFUtils.fonts.bold)
			.heightOfString(header.titleLeft, {
				width: 476,
				continued: false
			});
		doc
			.moveTo(60, 30)
			.font(PDFUtils.fonts.bold)
			.fontSize(header.titleLeftFontSize || 16)
			.fill('#166911')
			.text(header.titleLeft, PDFUtils.textIdents.left, (header.titleLeftTopIdent || 25)-(titleLeftHeight > 24 ? 8 : 0), {
				lineGap: -4,
				width: 476,
			});	
	}

	PDFUtils.writeFooter=(doc, header, pageNum)=>{
		if (!header){
			return;
		}				
	}
	
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
								return (subItem.name || subItem.title).replace('Concept ', '').replace('.', '');
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
		
		return;	
		
	}	
	//5.25, 5.21
	console.log('Preparing content blocks...');
	await generateBlocks();
	console.log('Created '+blocks.length+' blocks');	
	
	
	const pdfFileName='NGSS '+model.display_name+' Unit '+unit.number+'.pdf';
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