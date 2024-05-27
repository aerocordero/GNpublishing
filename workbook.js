/*
	node workbook.js --model=<modelId> --unit=<unitId> [--dest-path="<path_to_dest_pdf_file>"] [--first-export] [--flush-cache]
*/

async function main() {
	const mysql = require('mysql2');
	const bluebird = require('bluebird');
	const parse = require('node-html-parser').parse;
	const fs = require('fs');
	const http = require('https');
	const _ = require('lodash');
	const Jimp = require('jimp');
	const argv = require('yargs').argv;
	const Color = require('color');
	const svgpath = require('svgpath');
	const csv=require("csvtojson");

	const language = argv.language;
	const languageId = language==='spanish' ? 2 : 1;
	const customPageFolders={
		1: '1hqsJWKFny-Myf7UiyJOVvpYqt48Em4BZ',
		2: '1T3vSEZoIzH6D6Nu0F2dDEpghgGyJL4RT'
	}
	const phenomenonWord={
		1: 'phenomenon',
		2: 'fenomeno'
	}
	const CPFolderName='workbook'+(languageId >1 ? '_'+language : '');
	console.log('languageId:'+languageId);
	
	const config = require('./config.json');
	
	const {
		decodeHtml,
		asyncForEach,
		downloadFile,
		convertImage,
		imageInfo,
		getImgPropheight,
		dbQuery,
		closeDbConnection,
		convertPdf,
		processObjectFieldsIntoBlocks,
		parseHTMLIntoBlocks,
		cleanUpHTML,
		initCustomPages,
		getImgInfoAndRotate,
		parseHtml,
		flushCache,
		GDFolderSync,
		saveQueue,
		loadQueue,
		convertPptxPdf,
		setDBName,
		initCustomPagesFromDB,
		gnSubDomains,
		getImgPropWidth
	} = require('./lib/utils');
	const { materialsQtySet } = require('./lib/greenninja');
	const PDFUtilsObj  = require('./lib/pdf-utils');

	if (argv.db){
		setDBName('greenninja_'+argv.db)
	}

	const gnAppUrl='https://'+gnSubDomains[argv.db]+'.greenninja.org';
	
	if (argv.flushCache){
		flushCache();
	}
	else if (argv.flushDbCache){
		flushCache(true);
	}
	console.log('Google Drive folder syncing...')
	if (argv.gdSync || argv.gdSync===undefined){
		//console.log(customPageFolders[languageId]);
		//await GDFolderSync(customPageFolders[languageId], CPFolderName);
	}
	const queueItemId=argv.queueItemId;
	const disableImages=argv.disableImages;

	
	
	const colors={
		unitTitle: '#FF5609',
		green: '#6FAC44',
		lessonGreen: '#1E793C',
		brown: '#634439',
		black: 'black',
		blue: '#26adca'
	}
	const gradeColors={
		'Grade 6': '#FF5609',
		'Grade 7': '#15ADCB',						
		'Grade 8': '#89C440',
	}
	
	const textIdents={
		left: 48,
		top: 85
	}
	
	const fonts={
		regular: 'fonts/mulish/Mulish-Regular.ttf',
		medium: 'fonts/mulish/Mulish-Medium.ttf',
		bold: 'fonts/mulish/Mulish-Bold.ttf',
		semiBold: 'fonts/mulish/Mulish-SemiBold.ttf',
		italic: 'fonts/mulish/Mulish-Italic.ttf',
		boldItalic: 'fonts/mulish/Mulish-BoldItalic.ttf',
		arial: 'fonts/arial-unicode-ms.ttf', 
	}
	const fontsHeading={
		regular: 'fonts/Kodchasan/Kodchasan-Regular.ttf',
		bold: 'fonts/Kodchasan/Kodchasan-Bold.ttf',
		semiBold: 'fonts/Kodchasan/Kodchasan-SemiBold.ttf',
		italic: 'fonts/Kodchasan/Kodchasan-Italic.ttf',
		boldItalic: 'fonts/Kodchasan/Kodchasan-BoldItalic.ttf',
	}
	
	console.log('Connected to the DB');
	
	const modelId=argv.model;//19;
	const unitId=argv.unit;//35;
	const printLessonNum=argv.lesson;
	const gdAssetsPath=config.gdAssetsPath;
	
	//const customPages=initCustomPages(__dirname+'/custom-pages-workbook');
	
	console.log('Loading data...');
	
	const model=(await dbQuery([
		'SELECT * FROM `model` t',
		'WHERE t.`model_id` = ?'
	], [modelId]))[0];
	model.number=parseInt(model.display_name.replace('Grade ', ''));
	
	let unit=(await dbQuery([
		'SELECT * FROM `unit` t',
		'WHERE t.`unit_id` = ?'
	], [unitId]))[0];
	unit.files=[];
	unit.number=model.unit_id.split(',').indexOf(unit.unit_id+"")+1;
	if (gradeColors[model.display_name]){
		colors.unitTitle=gradeColors[model.display_name];
	}
	let translations=(await dbQuery([
		'SELECT * FROM `translation` t',
		'WHERE t.`class_name` = "Unit" AND t.`item_id` = ?'
	], [unitId]));
	
	translations.forEach(tr=>{
		if (tr.language_id===languageId && tr.value){
			unit[tr.field_name]=tr.value;
		}
	})
	
	//console.log(unit);
	//return
	const allMessages={};
	const customPagesGlobal=await initCustomPagesFromDB();
	if (languageId >1){
		Object.keys(customPagesGlobal).forEach(key=>{
			if (customPagesGlobal[key+'_'+language]){
				customPagesGlobal[key]=customPagesGlobal[key+'_'+language];
			}
		})
	}
	const translate=(msg)=>{
		const translations=customPagesGlobal.translations || {};
		if (languageId >1 && translations[msg]){
			return translations[msg];
		}
		allMessages[msg]="";
		return msg;
	}
	const unitReplacements=customPagesGlobal['g'+model.number+'u'+unit.number];
	if (unitReplacements){
		//console.log(unit.student_unit_roadmap);
		const roadmapRoot=parse(unit.student_unit_roadmap);
		
		unit=_.extend(unit, unitReplacements);
		unit.student_unit_roadmap='<p>'+unit.student_unit_roadmap+'</p><p>'+roadmapRoot.querySelector('img').toString()+'</p>'
		//console.log(unit.student_unit_roadmap);
	}
	//console.log(customPagesGlobal);
	//return;
	
	//const customPages=await initCustomPages(gdAssetsPath+model.display_name+" Unit "+unit.number+" Assets");
	//console.log(customPagesGlobal);
	unit.review=(await dbQuery([
		'SELECT * FROM `unit_review` t',
		'WHERE t.`unit_id` = ?'
	], [unitId]))[0];
	
	unit.reviewWorkshet=await dbQuery([
		'SELECT *',
		'FROM unit_worksheet_mapping m',
		'JOIN worksheet_unit_review t ON m.worksheet_unit_review_id = t.worksheet_unit_review_id',
		'WHERE m.unit_id = ? AND t.worksheet_language_id='+languageId
	], [unitId]);
	const reviewFilesRoot=parse(unit.review.files).querySelectorAll('li');
	unit.reviewWorkshet.forEach(item=>{
		const pathArr=item.path.split('/');
		item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
		item.fileNameWithExt=item.fileName+'.'+item.type;
		item.fileTitle=item.fileName;
		
		const node=reviewFilesRoot.find(n=>n.rawText.indexOf(item.fileName)>=0);				
		//console.log(unit.review)
		item.textIndex=unit.review.files.indexOf(item.fileName);
		if(node && node.querySelector('em')){
			item.title=node.querySelector('em').text.replace(model.display_name, '').replace('Unit '+unit.number, '').trim();
		}
		
	})
	unit.reviewWorkshet=_.sortBy(unit.reviewWorkshet, file=>file.textIndex);
	if (unitReplacements && unitReplacements.studyGuideFiles){
		const reviewWorsheet=[{
			type: 'pdf'
		}];
		unitReplacements.studyGuideFiles.forEach(item=>{
			const file=unit.reviewWorkshet.find(f=>f.fileNameWithExt===item.fileName);
			if (file){
				file.title=item.title;
				reviewWorsheet.push(file);
			}
		});
		unit.reviewWorkshet=reviewWorsheet;
		
	}
	//console.log(unit.reviewWorkshet)
	//return;

	
	let lessons=await dbQuery([
		'SELECT * FROM `lesson` t',
		'INNER JOIN `unit_lesson_mapping` m',
		'ON t.`lesson_id`=m.`lesson_id` AND m.`unit_id` = ?',
	], [unitId]);

	/*
	const standardTypes=['pe', 'ccc', 'ccm', 'ccl', 'sep', 'dci', 'eld'];
	unit.orphanStandards={};
	unit.commonCoreStandards={};	
	standardTypes.forEach(key=>{
		unit.orphanStandards[key]=[];
		unit.commonCoreStandards[key]=[];		
	})
	*/

	
	
	const unitLessonIds=unit.lessons.split(',');
	
	await asyncForEach(lessons, async (lesson)=>{

		lesson.index=unitLessonIds.indexOf(lesson.old_lesson_id);
		lesson.number=unit.number+'.'+(lesson.index+1);
		
		const query=languageId==1 ? [
			'SELECT t.*, f.*, m.for_student, m.for_print, m.lesson_id',
			'FROM lesson_worksheet_mapping m',
			'INNER JOIN worksheet t ON m.worksheet_id = t.worksheet_id',			
			'LEFT OUTER JOIN file f ON f.id = t.file_id',
			'WHERE m.lesson_id = ? AND t.type NOT IN ("rtf", "xlsx", "txt") AND t.worksheet_language_id='+languageId
		] : [
			'SELECT child.*, f.*, m.for_student, m.for_print, m.lesson_id',
			'FROM lesson_worksheet_mapping m',
			'INNER JOIN worksheet t ON m.worksheet_id = t.worksheet_id',
			'INNER JOIN worksheet child ON t.worksheet_id = child.version_worksheet_id',
			'LEFT OUTER JOIN file f ON f.id = child.file_id',
			'WHERE m.lesson_id = ? AND child.type NOT IN ("rtf", "xlsx", "txt") AND child.worksheet_language_id='+languageId,			
			'ORDER BY child.worksheet_id DESC',			
		]
		
		lesson.worksheet=await dbQuery(query, [lesson.lesson_id]);		
		lesson.worksheet=_.sortBy(lesson.worksheet, item=>item.type!=='pptx');
		
		lesson.worksheet.forEach(ws=>{
			if (ws.google_drive_object?.title){
				ws.originalname=ws.google_drive_object?.title;
				ws.type='pdf';
			}
			ws.wsName=ws.originalname.replace(`Lesson${lesson.number}`, '').replace('.pdf', '').replace('-fenomeno-tx', '-fenomeno');
		});
		
		
		console.log('result', lesson.worksheet.map(ws=>ws.originalname));

		lesson.worksheet=lesson.worksheet.filter(ws=>(ws.type==='pdf' || ws.google_drive_object) && ws.originalname);
		
		lesson.worksheet.forEach(ws=>{
			//console.log(ws.google_drive_object);
			if (ws.google_drive_object){
				const obj=_.isObject(ws.google_drive_object) ? ws.google_drive_object : JSON.parse(ws.google_drive_object);
				if (obj.exportLinks && obj.exportLinks['application/pdf']){
					ws.path=obj.exportLinks['application/pdf'];
					ws.editUrl=obj.alternateLink;
				}
			}
		});
		lesson.worksheet=_.sortBy(lesson.worksheet.filter(ws=>ws.path), ws=>ws.type==='pdf');
		/*
		const groups=_.groupBy(lesson.worksheet, ws=>{
			return ws.originalname.split('.').slice(0, -1).join('.');
		})
		lesson.worksheet=Object.values(groups).map(gr=>gr[0]);*/
		if (languageId > 1){
			lesson.worksheet=Object.values(_.groupBy(lesson.worksheet, ws=>ws.version_worksheet_id)).map(gr=>gr[0]);
		}	
		lesson.worksheet=_.sortBy(lesson.worksheet, ws=>!ws.google_drive_object);
		lesson.worksheet=Object.values(_.groupBy(lesson.worksheet, ws=>ws.wsName)).map(gr=>gr.find(f=>f.for_student) || gr[0]);	
		
		console.log(lesson.lesson_id, query.join('\n'));
		console.log(lesson.worksheet.map(ws=>{
			return {
				path: ws.path,
				for_student: ws.for_student
			}
		}));
		
		lesson.activityPlan=await dbQuery([
			'SELECT *',
			'FROM activity_plan t',
			'WHERE t.lesson_id = ?',
			'ORDER BY t.header'
		], [lesson.lesson_id]);
		lesson.vocab=await dbQuery([
			'SELECT *'+(languageId > 1 ? ', sp.word as sp_word, sp.definition as sp_definition, sp.vocab_id as sp_vocab_id' : ''),
			'FROM lesson_vocab_mapping m',
			'JOIN vocab t ON m.vocab_id = t.vocab_id',
			languageId > 1 ? 'LEFT OUTER JOIN vocab sp ON sp.version_vocab_id = t.vocab_id and sp.language_id='+languageId : '',
			'WHERE m.lesson_id = ?' 
		], [lesson.lesson_id]);		
		
	});
	//return;
	/*
	standardTypes.forEach(key=>{
		unit.orphanStandards[key]=_.sortBy(unit.orphanStandards[key], item=>item.title);
		unit.commonCoreStandards[key]=_.sortBy(unit.commonCoreStandards[key], item=>item.title);
	});
	*/
	//console.log(unit);
	//return;
	
	let allWorkShets=[];	
	
	
	
	const lessonWorkshetTextReplace=(lesson, obj, fields)=>{
		//obj.files=[];
		fields.forEach(field=>{
			obj[field]=(obj[field] || '').replace(new RegExp('\(\{\{([^\s]+)\}\}([a-z\-\.]+)\)', 'igm'), (match, str, old_lesson_id, str1, str2)=>{
				//console.log('old_lesson_id', old_lesson_id, str);
				const fileLesson=lessons.find(l=>l.old_lesson_id===old_lesson_id);
				if (!fileLesson){
					return str;
				}
				//console.log('regexp_'+field, match, str, str1);
				const workshet=fileLesson.worksheet.find(file=>file.fileNameWithExt===str1);
				//console.log(workshet);
				if (!workshet){
					console.log('Workshet "'+str1+'" is not found');
				}
				if (workshet){
					if (lesson.lesson_id===fileLesson.lesson_id){
						//obj.files.push(workshet);
					}					
					//return workshet.fileTitle;
					return '%'+workshet.worksheet_id+'%';
				}
				return str;
			});
		})
	}
	
	lessons.forEach(lesson=>{
		lesson.worksheet.forEach(file=>{
			allWorkShets.push(file);
		})
	});

	lessons=_.sortBy(lessons, l=>l.index);

	/*
	rc_pdf_worksheet_id
rc_ques_pdf_worksheet_id
rc_ques_key_pdf_worksheet_id
	*/

	let chapters=(await dbQuery([
		`SELECT t.*, 
			rc_pdf_ws.path as rc_pdf_worksheet, 
			rc_pdf_ws_spanish.path as rc_pdf_worksheet_spanish, 
			rc_pdf_ws.google_drive_object as rc_pdf_google_drive_object, 
			rc_pdf_ws_spanish.google_drive_object as rc_pdf_google_drive_object_spanish, 

			rc_ques_pdf.path as rc_ques_pdf_worksheet, 
			rc_ques_pdf_spanish.path as rc_ques_pdf_worksheet_spanish, 
			rc_ques_pdf.google_drive_object as rc_ques_pdf_google_drive_object, 
			rc_ques_pdf_spanish.google_drive_object as rc_ques_pdf_google_drive_object_spanish, 

			rc_ques_key_pdf.path as rc_ques_key_pdf_worksheet, 
			rc_ques_key_pdf_spanish.path as rc_ques_key_pdf_worksheet_spanish, 
			rc_ques_key_pdf.google_drive_object as rc_ques_key_pdf_google_drive_object,
			rc_ques_key_pdf_spanish.google_drive_object as rc_ques_key_pdf_google_drive_object_spanish
			
		FROM chapter t`,
		'LEFT OUTER JOIN worksheet rc_pdf_ws ON rc_pdf_ws.worksheet_id=t.rc_pdf_worksheet_id',
		'LEFT OUTER JOIN worksheet rc_pdf_ws_spanish ON rc_pdf_ws.worksheet_id=rc_pdf_ws_spanish.version_worksheet_id',
		'LEFT OUTER JOIN worksheet rc_ques_pdf ON rc_ques_pdf.worksheet_id=t.rc_ques_pdf_worksheet_id',
		'LEFT OUTER JOIN worksheet rc_ques_pdf_spanish ON rc_ques_pdf.worksheet_id=rc_ques_pdf_spanish.version_worksheet_id',
		'LEFT OUTER JOIN worksheet rc_ques_key_pdf ON rc_ques_key_pdf.worksheet_id=t.rc_ques_key_pdf_worksheet_id',
		'LEFT OUTER JOIN worksheet rc_ques_key_pdf_spanish ON rc_ques_key_pdf.worksheet_id=rc_ques_key_pdf_spanish.version_worksheet_id',
	], []));
	let chapterLessonMappings=(await dbQuery([
		'SELECT * FROM `chapter_lesson_mapping` t',
		'ORDER BY t.position',
	], []));

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
	chapterGroups.forEach((chapter, index)=>{
		chapter.lessons=unit.chapterMappings.filter(uch=>uch.chapter_id===chapter.id);
		chapter.number=index+1;
	})
	unit.chapters=chapterGroups;
	//console.log(unit.chapters.find(ch=>ch.id===109));
	//return;

	unit.vocab=[];
	lessons.forEach(lesson=>{
		/*
		lesson.pe.forEach(item=>{
			item.lessons=lessons.filter(l=>l.pe.find(p=>p.pe_id===item.pe_id)).map(l=>l.number).join(', ');
		});
		*/
		lesson.worksheet.forEach(item=>{
			const pathArr=item.path.split('/');
			item.fileName=item.wsName || ((item.originalname || pathArr[pathArr.length-1]).replace('.'+item.type, ''));
			item.fileNameWithExt=item.fileName+'.'+item.type;
			item.fileTitle=translate('Lesson')+' '+lesson.number+''+item.fileName;
			item.lessonIndex=lesson.index;
		});
		lesson.worksheet=_.sortBy(lesson.worksheet, file=>file.fileName);
		//console.log(lesson.worksheet);
		lesson.activityPlan.forEach(item=>{
			item.files=[];
			lessonWorkshetTextReplace(lesson, item, ['content']);			
			//console.log(item.content);
		});
		lessonWorkshetTextReplace(lesson, lesson, ['anticipated_challenges', 'teacher_prep']);
		if (lesson.vocab){
			lesson.vocab.forEach(item=>{
				if (!unit.vocab.find(v=>v.word===item.word)){
					unit.vocab.push(item);
				}
			})
		}

	});
	allWorkShets=_.sortBy(allWorkShets, file=>file.fileName);
	allWorkShets=_.sortBy(allWorkShets, file=>file.lessonIndex);	
	unit.vocab=_.sortBy(unit.vocab, v=>v.word);
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
	
	
	const materialData=materialsQtySet(materialDataRaw);	

	lessons.forEach(lesson=>{
		lesson.materials=materialData.materialsListUnitOverview.filter(item=>item.lesson_id===lesson.lesson_id);
	})
	
	let materials={};
	['materialLsKit', 'materialLsTeacher', 'materialLsOptional'].map(key=>{
		const rawData=materialData[key];
		materials[key]=_.sortBy(_.values(_.groupBy(rawData, m=>m.material_id)).map(materials=>{	
			const item=materials[0];
			const items=materialData.materialsListUnitOverview.filter(m=>m.material_id===item.material_id);
			let quantity=parseFloat(item.totalQty);
			let name=item.plural_name || item.name;
		
		
			items.forEach(item=>{
				//quantity+=(parseFloat(item.quantity) || 0);
				item.lesson=lessons.find(l=>l.lesson_id==item.lesson_id);
			});
		
		
		
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
			const notes=item.notes.map(n=>unit.number+'.'+n.lesson_sequence + ' - '+ n.note).join(', ');
			const alternative=item.alternative.map(n=>unit.number+'.'+n.lesson_sequence + ' - '+ n.alternative).join(', ');
			
			const nameArr=[{
				text: name,
				params: {
					continued: true
				}
			}];
			
			const markers=['student_can_bring', 'runsOutInd', 'kitReplacementInd'];
			
			markers.forEach(key=>{
				if (item[key]){
					nameArr.push({
						text: ' '+(markers.indexOf(key)+1),
						params: {
							features: ['sups'],
							continued: true
						}
					})
				}
			});
			const dimentionsFields=['dimensions_wide', 'dimensions_len', 'dimensions_high'];
		
			if (dimentionsFields.find(field=>item[field]>0) || (item.other_specs || parseFloat(item.weight))){
				const otherSpecs=item.other_specs ? item.other_specs : (parseFloat(item.weight) ? parseFloat(item.weight)+' '+item.specifications_unit : '');
				const dimentions=dimentionsFields.filter(field=>item[field]>0).map(field=>parseFloat(item[field]));
				nameArr.push({
					text: '\n('+(otherSpecs ? otherSpecs : dimentions.join(' x ')+' '+item.specifications_unit)+')',
					params: {
						features: []
					}
				})
			}
			
			
			return _.extend(item, {
				name: nameArr.map(n=>n.text).join(' '),
				nameArr,
				quantity: quantity || '',
				lessons: _.sortBy(items.map(item=>{
					return item.lesson.number;
				}), number=>parseInt(number.split('.')[1])).join(', '),
				alternative,
				notes,
				optionalInd: item.optionalInd,
				forWhomInd: item.forWhomInd,
				provider: item.provider
			})
		}), m=>m.name);
	})
	
	console.log('Loaded Unit "'+unit.name+'" and '+lessons.length+' lessons');
	await closeDbConnection();
	//console.log(unit);
	
	const PDFUtils=new PDFUtilsObj(colors, fonts, textIdents);	
	const contentWidth=540;	
	
	PDFUtils.textWidth=contentWidth-10;
	PDFUtils.defaultFontSize=11;
	PDFUtils.tocStyles={
		title: {
			text: translate('Table of Contents'), 
			color: colors.unitTitle,
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
			icon: 'arrow',
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
	
	PDFUtils.headerTitles=[

	];	

	PDFUtils.writeNotesPage=(doc, pageNum, {title, topIdent, svgFileName, svgTopIdent})=>{			

		//writeHeader=(doc, header, pageNum)
		PDFUtils.writeHeader(doc, {
			leftTitle: '',	
			type: 'lamp',
			topWhiteOverlayHeight: 0,
			lineY: 45,
			//chapter: {},
		}, pageNum);

		const titleHeight=doc
			.fontSize(18)
			.font(fonts.bold)
			.heightOfString(title, {
				width: 490,
				align: 'left',
			});
			const boxHeight=80;
			const boxWidth=40;
		
		//
		doc
			.font(fontsHeading.bold)
			.fontSize(18)
			.fill(colors.unitTitle)
			.text(title, pageNum%2===0 ? 80 : 55, ((boxHeight/2)-(boxWidth/2))+15-(titleHeight > 24 ? 10 : 0), {
			width: 490,
			align: 'left'
		});
		console.log(svgFileName);
		const svg=fs.readFileSync('images/'+(svgFileName || 'notes-box2.svg'), 'UTF-8')
			.replace(/\#F05925/ig, colors.unitTitle)
			.replace(/\#E8C3BC/ig, Color(colors.unitTitle).lighten(0.6).hex());

		doc
			.addSVG(svg, 50, svgTopIdent || 1, {
				width: 520,
				//height: 525,				  
			});
	}
	
	PDFUtils.writeHeader=(doc, header, pageNum)=>{
		if (!header){
			return;
		}
		
		let lineY=header.lineY || 65;
		let lineWidth=2;
		
		if (header.topWhiteOverlayHeight){
			doc
			  .save()
			  .moveTo(0, 0)
			  .lineTo(contentWidth+textIdents.left*2, 0)
			  .lineTo(contentWidth+textIdents.left*2, header.topWhiteOverlayHeight)
			  .lineTo(0, header.topWhiteOverlayHeight)
			  .fill('white');	
		}

		const bookmarkStyle=['reading', 'lamp', 'phenomenon'].indexOf(header.type)>=0;
		
		if (header.type==='nameClassDate'){			
			lineY=45;		
			
			doc
			  .font(fonts.regular)
			  .fontSize(12)
			  .fillColor('black')
			  .text(translate('Name'), textIdents.left-10, 25, {
				width: 50,
				align: 'left'
			  });
			  
			doc
			  .font(fonts.regular)
			  .fontSize(12)
			  .fillColor('black')
			  .text(translate('Class'), textIdents.left+290, 25, {
				width: 50,
				align: 'left'
			  });
			  
			doc
			  .font(fonts.regular)
			  .fontSize(12)
			  .fillColor('black')
			  .text(translate('Date'), textIdents.left+410, 25, {
				width: 50,
				align: 'left'
			  });
			
		}
		else if (bookmarkStyle){	
			const boxIdent=pageNum%2===0 ? 20 : 550;	
			const boxHeight=80;
			const boxWidth=40;
			let iconTopIdent=10;
			if (header.type==='phenomenon'){
				iconTopIdent=3
			}
			doc
			.save()
			.moveTo(boxIdent, -10)
			//.lineTo(50, 40)
			.lineTo(boxIdent, boxHeight-10)
			.bezierCurveTo(boxIdent, boxHeight-10, boxIdent, boxHeight, boxIdent+10, boxHeight)
			.lineTo(boxIdent+boxWidth-10, boxHeight)
			.bezierCurveTo(boxIdent+boxWidth-10, boxHeight, boxIdent+boxWidth, boxHeight, boxIdent+boxWidth, boxHeight-10)
			.lineTo(boxIdent+boxWidth, -10)
			.fill(colors.unitTitle);			
			doc
				.addSVG(fs.readFileSync('images/icons/'+header.type+'-icon.svg', 'UTF-8'), boxIdent+5, ((boxHeight/2)-(boxWidth/2))+iconTopIdent, {
				  width: boxWidth-10,
				  height: boxWidth-10,				  
				});
			//console.log(header);
			if (header.chapter && header.type!=='phenomenon'){
				/*
				doc
					.font(fonts.regular)
					.fontSize(12)
					.fillColor(header.color || colors.unitTitle)
					.text('Lessons '+header.chapter.lessonSequence, textIdents.left+25, ((boxHeight/2)-(boxWidth/2))+5, {
						width: contentWidth-75,
						align: pageNum%2===0 ? 'left' : 'right',
					});
				*/
					const titleText=`${header.title}: ${header.chapter.name}`;

					const titleHeight=doc
						.fontSize(16)
						.font(fonts.bold)
						.heightOfString(titleText, {
							width: contentWidth-75,
							align: pageNum%2===0 ? 'left' : 'right',
						});
					doc
					.font(fonts.bold)
					.fontSize(16)
					.fillColor(header.color || colors.unitTitle)
					.text(titleText, textIdents.left+25, ((boxHeight/2)-(boxWidth/2))+15-(titleHeight > 24 ? 10 : 0), {
						width: contentWidth-75,
						align: pageNum%2===0 ? 'left' : 'right',
					});
			}
			else if (header.type==='phenomenon'){
				doc
					.font(fonts.bold)
					.fontSize(16)
					.fillColor(header.color || colors.unitTitle)
					.text(translate("Phenomenon"), textIdents.left+25, ((boxHeight/2)-(boxWidth/2))+5, {
						width: contentWidth-75,
						align: pageNum%2===0 ? 'left' : 'right',
					});
					//lineY+=10;
					let lineStart=textIdents.left-10;
					let lineEnd=contentWidth+textIdents.left-35;
					if (pageNum%2===0){
						lineStart=textIdents.left+10;
						lineEnd=contentWidth+textIdents.left-10;
					}
					doc
					.save()
					.moveTo(lineStart, lineY)
					//.lineTo(50, 40)
					.lineTo(lineEnd, lineY)
					.lineTo(lineEnd, lineY+lineWidth)
					.lineTo(lineStart, lineY+lineWidth)
					.fill(header.color || colors.unitTitle);	
			}
		}
		
		
		//doc.x=60;
	  
		
		
		if (header.showThoughtStartIcon){
			doc
				.image('images/icons/ThoughtStarterIcon.png', contentWidth-150+textIdents.left, 20, {
				  width: 150,
				  align: 'right',
				  valign: 'top'
				});
		}
	  
	  	if (!header.hideLine && !bookmarkStyle){
			if (header.type!=='nameClassDate' && header.type!=='line'){
				doc
					.font(fonts.bold)
					.fontSize(24)
					.fillColor(header.color || colors.unitTitle)
					.text(header.titleLeft, textIdents.left+70, 30, {
						width: contentWidth-164,
						align: pageNum%2===0 ? 'left' : 'right'
					});

				lineY=60;
				const boxHeight=30;

				if (pageNum%2===0){
					doc
					.save()
					.moveTo(-10, lineY-boxHeight)
					//.lineTo(50, 40)
					.lineTo(textIdents.left+40, lineY-boxHeight)
					.bezierCurveTo(textIdents.left+40, lineY-boxHeight, textIdents.left+50, lineY-boxHeight, textIdents.left+50, lineY-boxHeight+10)
					.lineTo(textIdents.left+50, lineY+lineWidth-10)
					.bezierCurveTo(textIdents.left+50, lineY+lineWidth-10, textIdents.left+50, lineY+lineWidth, textIdents.left+40, lineY+lineWidth)
					.lineTo(-10, lineY+lineWidth)
					.fill(colors.unitTitle);	
				}
				else {
					const boxLeftIdent=514;
					doc
						.save()
						.moveTo(boxLeftIdent, lineY-boxHeight+10)
						.bezierCurveTo(boxLeftIdent, lineY-boxHeight+10, boxLeftIdent, lineY-boxHeight, boxLeftIdent+10, lineY-boxHeight)
						.lineTo(boxLeftIdent+200, lineY-boxHeight)						
						.lineTo(boxLeftIdent+200, lineY+lineWidth)
						.lineTo(boxLeftIdent+10, lineY+lineWidth)
						.bezierCurveTo(boxLeftIdent+10, lineY+lineWidth, boxLeftIdent, lineY+lineWidth, boxLeftIdent, lineY+lineWidth-10)
						.lineTo(boxLeftIdent, lineY-boxHeight+10)
						.fill(colors.unitTitle);	
						/*
						.moveTo(boxLeftIdent+12, lineY-10)
						//.lineTo(50, 40)
						.bezierCurveTo(boxLeftIdent+12, lineY-10, boxLeftIdent+12, lineY-20, boxLeftIdent+22, lineY-20) 
						.lineTo(boxLeftIdent+textIdents.left+35, lineY-20)
						.lineTo(boxLeftIdent+textIdents.left+35, lineY+boxHeight)
						.lineTo(boxLeftIdent+12, lineY+boxHeight)
						.fill(colors.unitTitle);	
						*/

					/*
					doc
					.save()
					.moveTo(boxLeftIdent, lineY-boxHeight)
					//.lineTo(50, 40)
					.lineTo(textIdents.left+40, lineY-boxHeight)
					.bezierCurveTo(textIdents.left+40, lineY-boxHeight, textIdents.left+50, lineY-boxHeight, textIdents.left+50, lineY-boxHeight+10)
					.lineTo(textIdents.left+50, lineY+lineWidth-10)
					.bezierCurveTo(textIdents.left+50, lineY+lineWidth-10, textIdents.left+50, lineY+lineWidth, textIdents.left+40, lineY+lineWidth)
					.lineTo(0, lineY+lineWidth)
					.fill(colors.unitTitle);	*/
				}
				
					
			}
			else {
				doc
				.save()
				.moveTo(textIdents.left-10, lineY)
				//.lineTo(50, 40)
				.lineTo(contentWidth+textIdents.left-10, lineY)
				.lineTo(contentWidth+textIdents.left-10, lineY+lineWidth)
				.lineTo(textIdents.left-10, lineY+lineWidth)
				.fill(header.color || colors.unitTitle);	
			}
	  		
	  	}
		
		
	}
	
	PDFUtils.writeFooter=(doc, pageNum, startPagingPage, footerData)=>{
		const lineY=753;
		const lineWidth=2;
		const hideLine=footerData && footerData.hideLine;
		const leftText=footerData?.leftText;
		
		if (pageNum%2===0){
			
			

				doc
				  .save()
				  .moveTo(-10, lineY-20)
				  //.lineTo(50, 40)
				  .lineTo(textIdents.left+16-10, lineY-20)
				  .bezierCurveTo(textIdents.left+16-10, lineY-20, textIdents.left+16, lineY-20, textIdents.left+16, lineY-10)
				  .lineTo(textIdents.left+16, lineY+lineWidth)
				  .lineTo(-10, lineY+lineWidth)
				  .fill(colors.unitTitle);	

				if(!hideLine){
					doc
					.save()
					.moveTo(textIdents.left+16, lineY)
					//.lineTo(50, 40)
					.lineTo(contentWidth+textIdents.left-14, lineY)
					.lineTo(contentWidth+textIdents.left-14, lineY+lineWidth)
					.lineTo(textIdents.left+16, lineY+lineWidth)
					.fill(colors.unitTitle);	
					
					doc
						.font(fonts.arial)
						.fontSize(6)
						.fill('black')
						.text('© '+((new Date()).getYear()+1900)+' Green Ninja', textIdents.left-14, lineY+5, {
							width: contentWidth,
							continued: false,
							align: 'right'
						});
				}
			 
				
			
			doc
			.font(fonts.regular)
			.fontSize(12)
			.fill('white')
			.text(pageNum, textIdents.left-10, lineY-17, {
				width: 465,
				continued: false,
				align: 'left'
			});
		}
		else {
			
			

			doc
				.save()
				.moveTo(contentWidth+8, lineY-10)
				//.lineTo(50, 40)
				.bezierCurveTo(contentWidth+8, lineY-10, contentWidth+8, lineY-20, contentWidth+18, lineY-20) 
				.lineTo(contentWidth+textIdents.left+35, lineY-20)
				.lineTo(contentWidth+textIdents.left+35, lineY+lineWidth)
				.lineTo(contentWidth+8, lineY+lineWidth)
				.fill(colors.unitTitle);	

			

			if(!hideLine){
				doc
				.save()
				.moveTo(textIdents.left-10, lineY)
				//.lineTo(50, 40)
				.lineTo(contentWidth+textIdents.left-35, lineY)
				.lineTo(contentWidth+textIdents.left-35, lineY+lineWidth)
				.lineTo(textIdents.left-10, lineY+lineWidth)
				.fill(colors.unitTitle);	
				doc
				.font(fonts.arial)
				.fontSize(6)
				.fill('black')
				.text('© '+((new Date()).getYear()+1900)+' Green Ninja', textIdents.left-10, lineY+5, {
					width: contentWidth,
					continued: false,
					align: 'left'
				});
			}
			
			
			
			doc
			.font(fonts.regular)
			.fontSize(12)
			.fill('white')
			.text(pageNum, textIdents.left-14, lineY-17, {
				width: contentWidth,
				continued: false,
				align: 'right'
			});
		}
		
		if (leftText){
			doc
			  .font(fonts.regular)
			  .fontSize(10)
			  .lineGap(-0.5)
			  .fill('black')
			  .text(leftText, textIdents.left+25, lineY-18, {
			  	width: contentWidth-75,
				continued: false,
				align: pageNum%2===0 ? 'left' : 'right'
			  });
		}
	}
	
	PDFUtils.writeSectionCover=(doc, {title, image, color, contentsTitle, contentsLevel, sectionNum, chapterNum, text, subTitle, textFontSize, addNotes, notesTitle, notesParams})=>{
		PDFUtils.currentTitle=null;				
		doc.addPage();
		if (PDFUtils.isLeftPage() && addNotes){
			PDFUtils.drawActions.setFooter(doc, {hideLine:true});	
			if (notesTitle){
				PDFUtils.writeNotesPage(doc, PDFUtils.pageNum, {
					title: notesTitle,
					...(notesParams || {}),
				});	
				PDFUtils.drawActions.setFooter(doc, {hideLine:false});
			}						
			doc.addPage();	
		}
		if (PDFUtils.isLeftPage() && chapterNum){
			//PDFUtils.drawActions.setFooter(doc, {hideLine:true});
			//doc.addPage();			
		}
		let top=180;

		const titleHeight=doc
			.fontSize(38)
			.font(fonts.regular)
			.heightOfString(title, {
				width: PDFUtils.textWidth,
				align: 'center'
			});

		doc.x=60;
		
		if (sectionNum){			

			doc
				.save()
				.font(fontsHeading.bold)
				.fontSize(18)
				.fill(color)
				.text(translate('Section'), textIdents.left+20, 30, {
					width: 100,
					align: 'center'
				  });

			doc
				.save()
				.font(fontsHeading.bold)
				.fontSize(55)
				.fill(color)
				.text('0'+sectionNum, textIdents.left+20, 45, {
					width: 100,
					align: 'center'
				  });

			doc
				.font(fontsHeading.bold)
				.fontSize(42)
				.fill(color)
				.text(title, textIdents.left+140, 40, {
				//width: 400,
				//align: 'center'
				});

			let curveTop=doc.y+30;

			doc
				.save()
				.moveTo(-10, curveTop)
				//.lineTo(50, 40)
				.bezierCurveTo(200, curveTop+60, 200, curveTop-40, 420, curveTop+0)
				.quadraticCurveTo(500, curveTop+15, 640, curveTop)
				.lineWidth(2)
				.stroke(color);

			
			doc.y+=130;
		}
		else if (chapterNum) {

			const curveLeft=PDFUtils.isRightPage() ? 50 : 550;
			doc
				.save()
				.moveTo(curveLeft, -10)
				//.lineTo(50, 40)
				.bezierCurveTo(curveLeft-40, 300, curveLeft+80, 600, curveLeft-30, 850)
				//.quadraticCurveTo(500, curveTop+15, 640, curveTop)
				.lineWidth(2)
				.stroke(color);

			doc
				.font(fonts.bold)
				.fontSize(20)
				.fill(color)
				.text(translate('Chapter')+' '+chapterNum, textIdents.left, top, {
					width: PDFUtils.textWidth,
					align: 'center',
					//underline: true
				});
			
			doc
				.save()
				.moveTo(260, top+30)
				//.lineTo(50, 40)
				.lineTo(370, top+30)
				.lineWidth(2)
				.stroke(color);
				
			doc
				.font(fonts.bold)
				.fontSize(28)
				.fill(color)
				.text(title, 140, top+50, {
					width: 350,
					align: 'center'
				});

				doc.y+=40;
			
				/*
			doc
			.font(fonts.bold)
			.fontSize(14)
			.fill('black')
			.text(subTitle, textIdents.left, doc.y, {
				width: PDFUtils.textWidth,
				align: 'center'
			});
			doc.y+=20;
			*/
		}
		else {
			doc
				.font(fonts.regular)
				.fontSize(38)
				.fill(color)
				.text(title, textIdents.left, top+(titleHeight > 40 ? 20 : 80), {
					width: PDFUtils.textWidth,
					align: 'center'
				});
				doc.y+=30;
		}

		
		if (text){
			
			parseHtml(text.split('\n').map(t=>t.trim()).join('').trim()).childNodes.forEach(node=>{
				//console.log('nodenodenodenode', node);
				PDFUtils.drawActions.p(doc, {
					value: node.childNodes,
					isHtml:true,
					parentEl: node,
					params: {
						ident: 90,
						width: 360,
						fontSize: 12,
						listsIdent: 15,
						processListsAsBlocks: true,
						moveDown: 1.0
					}
				});
				//doc.y+=2;
			})
			
		}
		if (image){
			//doc.y-=15; a-design-solutions-evaluations
			console.log(image);
			PDFUtils.drawActions.image(doc, {
				value: image,
				width: 240,
				align: 'center'
			})
			
		}
		  
		if (sectionNum){
			let curveTop=700;
			doc
				.save()
				.moveTo(-10, curveTop)
				//.lineTo(50, 40)
				.bezierCurveTo(200, curveTop+60, 200, curveTop-40, 420, curveTop+0)
				.quadraticCurveTo(500, curveTop+15, 640, curveTop)
				.lineWidth(2)
				.stroke(color);
		}

		

		if (contentsTitle){
			PDFUtils.drawActions.contentsPush(doc, {title:contentsTitle, level:contentsLevel || 0, color});
		}
		PDFUtils.drawActions.setFooter(doc, {hideLine:true});
		
	}
	//return;
	
	PDFUtils.convertHtml=(text)=>{
		const unitLessonIds=unit.lessons.split(',')
		return decodeHtml(text).replace(/\\n/g, '').replace(/\{\{([^\s]+)\}\}/g, (match, id)=>{
			//console.log(match, id);
			const item=lessons.find(l=>l.old_lesson_id===id);
			if (item){
				return translate('Lesson')+' '+item.number+' '+translate(item.name);
			}
			return '';
		});
	}

	let blocks=[];
	let exportInfo=[];
	//console.log('allWorkShets', allWorkShets.map(f=>f.path));
	//return;
	
	const generateBlocks=async ()=>{
		blocks=[];
		unit.files=[];
		exportInfo=[];
		
		const coverIndex=((_.keys(gradeColors).indexOf(model.display_name)*6)+unit.number-1);
		//console.log('StudentHighlight',customPagesGlobal.StudentHighlight['pages'+(languageId >1 ? '_'+language : '')][coverIndex]);
		
		blocks.push({
			type: 'pageBreak',
		});	

		
		blocks.push({
			type: 'image',
			value: 'images/cover_wave.svg',
			width: 110,
			svgContentProcessing: (str, x, y)=>{				
				return str
					.replace(/\#F05925/ig, colors.unitTitle)
					.replace(/\#E8C3BC/ig, Color(colors.unitTitle).lighten(0.6).hex());					

			},
			height: 840,
			x:0,
			y:-10
		});	
		const coverCSV=await csv().fromFile('automated_Highlight Quotes and Bios - '+(argv.db==='texas' ? 'TX - ' : '')+(languageId ===1 ? 'English' : 'Spanish')+'.csv');
		const spanishRC=await csv().fromFile('Spanish Reading Companion Upload - Sheet1.csv');
		const spanishChapterDesc=await csv().fromFile('chapter_descriptions_spanish.csv');
		
		const coverObject=coverCSV.find(obj=>obj['Grade/Unit']==='G'+model.number+'U'+unit.number);
		console.log('coverObject', coverObject);
		if (coverObject){
			blocks.push({
				type: 'custom',
				drawFn: (doc)=>{
					doc
					.font(fonts.medium)
					.fontSize(22)
					.fill(colors.unitTitle)
					.text(`${translate('Grade')} ${model.number} ${translate('Unit')} ${unit.number}`, textIdents.left, 70, {
						width: PDFUtils.textWidth,
						align: 'center'
					});
					
					doc
					.font(fonts.bold)
					.fontSize(36)
					.fill(colors.unitTitle)
					.text(translate(unit.name), textIdents.left+40, 105, {
						width: PDFUtils.textWidth-80,
						align: 'center'
					});
	
					doc
					.font(fonts.regular)
					.fontSize(18)
					.fill('black')
					.text(translate('Student Workbook'), textIdents.left, doc.y+15, {
						width: PDFUtils.textWidth,
						align: 'center',
						characterSpacing: 3.5
					});
	
					doc				
					.roundedRect(textIdents.left+50, doc.y+20, 420, 2, 5)
					.fill(colors.unitTitle);
	
					const maxQuteLength=160;
					let quoteFontSize=22;
					maxQuteLength-22
					if (coverObject.Quotes.length>maxQuteLength){
						quoteFontSize-=(coverObject.Quotes.length-maxQuteLength)/12
					}
	
					doc
					.font(fontsHeading.italic)
					.fontSize(quoteFontSize)
					.fill('black')
					.text(coverObject.Quotes, textIdents.left+120, doc.y+35, {
						width: 320,
						align: 'left',
						characterSpacing: 1,
						lineGap: 3,
					});
	
					doc
					.font(fonts.bold)
					.fontSize(12)
					.fill('black')
					.text('by '+coverObject.People, textIdents.left+270, doc.y+35, {
						width: 220,
						align: 'left',
						//characterSpacing: 1
					});
	
					doc
					.font(fonts.regular)
					.fontSize(12)
					.fill('black')
					.text(coverObject['Occupation/Title'], textIdents.left+270, doc.y+3, {
						width: 220,
						align: 'left',
						//characterSpacing: 1
					});
	
					doc				
					.roundedRect(textIdents.left+50, doc.y+30, 420, 2, 5)
					.fill(colors.unitTitle)
					.save();
	
					doc
					.font(fonts.regular)
					.fontSize(11)
					.fill('black')
					.text(coverObject['Bio Info'], textIdents.left+60, doc.y+50, {
						width: PDFUtils.textWidth-130,
						align: 'left',
						lineGap: 2,
						//characterSpacing: 0.5
					});
					
					if (argv.db==='texas'){
						doc
							.image('images/gn_logo_texas.jpg', 200, 690, {
							width: 200,
							align: 'center',
							valign: 'center'
							});
					}
					else {
						doc
							.image('images/gn_logo.png', 250, 690, {
							width: 100,
							align: 'center',
							valign: 'center'
							});
					}
					
				},
				
			});
		}
		
		
		/*
		blocks.push({
			type: 'image',
			value: customPagesGlobal.StudentHighlight['pages'+(languageId >1 ? '_'+language : '')][coverIndex].imagePath,
			width: 610,
			x:-1,
			y:-1
		});	
		*/
		
		blocks.push({
			type: 'sectionCover',
			sectionNum: 0,
			title: translate('About This Workbook'),
			contentsTitle: null,
			text: customPagesGlobal.wb_about,
			//textFontSize:12, 
			color: colors.unitTitle,
		});
		
		
		blocks.push({
			type: 'contents',
			contentsPagesNumber: 2,
		});
		blocks.push({
			type: 'setStartPagingPage',
		});		

		//return;
		
		/*
		blocks.push({
			type: 'contentsPush',
			title: 'Unit Introduction',
			color: colors.unitTitle,
			level:0
		})*/
		
		blocks.push({
			type: 'sectionCover',
			sectionNum: 1,
			title: translate('Introduction'),
			contentsTitle: translate('Section')+' 1: '+translate('Introduction'),
			text: customPagesGlobal.wb_introduction,
			//textFontSize:12, 
			color: colors.unitTitle,
		})

		blocks.push({
			type: 'h1',
			headerTitle: {titleLeft: translate('Unit Overview')},
			//startOnRightSide: true,
			color: colors.unitTitle,
		});		
		blocks.push({
			type: 'setStartPagingPage',
		});		
		
		blocks.push({
			type: 'contentsPush',
			title: translate('Unit Overview'), 
			level: 1, 
			color: colors.unitTitle
		});
		exportInfo.push({
			title: 'Unit',
			subtitle: `G${model.number}U${unit.number} ${unit.name}`,
			link: gnAppUrl+`/unit/${model.model_id}/${unit.unit_id}/${unit.number}/`,
			editUrl: gnAppUrl+'/automation2/curriculum/units/'+unit.unit_id,
			level: 1,
		});
		//
		await processObjectFieldsIntoBlocks(unit, [
			{title: '', field:'student_unit_storyboard', 
				paragraphsToPull: 1, 
				params: {
				}
			},
		], blocks);				

		blocks.push({
			type: 'p',
			value:'',
		});
		
		blocks.push({
			type: 'introductions',
			value:[
				{title: translate('Challenge'), field:'student_introduction_challenge_description'},
				{title: translate('Science Methods'), field:'student_introduction_science_methods_description'},
				{title: translate('Culminating Experience'), field:'student_introduction_culminating_experience_description'},
			],
			color: 'black',
			fontSize: 11,
			paddingBottom: 0.5,
			titleFont: fonts.bold,
			data: unit,
			moveDown: 0.000001,
		});

		blocks.push({
			type: 'image',
			value: 'images/notes-box.svg',
			width: 610,
			svgContentProcessing: (str, x, y)=>{
				const strokePath=`M623.8,545.6c-186.6,0-269.8,0.5-471.5,14.7C32.9,568.6-2.8,519.2,6.4,453.5C21.2,346.6,9,216.3,11.3,79.9
				C12,36.8,34.7,2.4,103.7,5.6C315.7,15,466,18.6,610,6.6c47.9-4,94.1,24.2,88.6,120.1c-8.9,143.1,4,182.8-5.3,361.6
				C691.7,515.1,662,545.6,623.8,545.6z`;
				const originalH=400;
				const space=700-y;				
				const scale=space/originalH;

				return str
					.replace('#F05925', colors.unitTitle)
					.replace('#E7C2BB', Color(colors.unitTitle).lighten(0.6).hex())
					.replace('{strokePath}', svgpath(strokePath)
						.scale(1, scale)
						.toString());
			}
			//height: 250,
			//x:-1,
			//y:100
		});	
		
		blocks.push({
			type: 'h1',
			headerTitle: {titleLeft: translate('Unit Roadmap')},
			startOnRightSide: false,
			color: colors.unitTitle,
		});	
		blocks.push({
			type: 'contentsPush',
			title: translate('Unit Roadmap'), 
			level: 1, 
			color: colors.unitTitle
		});
		

		
		const roadMapImg=allWorkShets.find(file=>file.fileTitle.indexOf('roadmap')>0 && file.type=='pdf');
		
			
		if (roadMapImg){
			const roadMapImgPath=await downloadFile(roadMapImg.path);
			const roadMapImgPaths=await convertPptxPdf(roadMapImgPath, roadMapImg, false, !!argv.firstExport);
			//const imgPaths=await convertPdf(path);

			await asyncForEach(roadMapImgPaths, async (item)=>{
				const imgInfo=await imageInfo(item.imagePath);
				/*
				blocks.push({
					type: 'image',
					value: item.imagePath,
					width: 650,
					x:-20,
					y:1
				});
				
				blocks.push({
					type: 'custom',
					drawFn: (doc)=>{
						const prevX=doc.x;
						const prevY=doc.y;
						
						doc
						  .save()
						  .moveTo(0, 48)
						  .lineTo(600, 48)
						  .lineTo(600, 150)
						  .lineTo(0, 150)
						  .fill('white');			
					},
					
				});
				*/
			});
		}
		
		await processObjectFieldsIntoBlocks(unit, [
			{title: '', field:'student_unit_roadmap', /*paragraphsToPull: 1,*/ params: {
				//fontSize:11
				imgParams: {
					marginTop: 2,
					fitToPage: true,
				}
			}},
		], blocks);
		
		
		//console.log(unit);
		//return;
		/*
		
		blocks.push({
			type: 'introductions',
			value:[
				{title: 'Unit Challenge', field:'introduction_challenge_description'},
			],
			color: 'black', titleFont: fonts.bold, fontSize: 12,
			leftIdent: textIdents.left-10,
			data: unit
		});
		*/
		
		blocks.push({
			type: 'notesPage',
			title: translate('Use this space to jot down notes and ideas about solving the Unit Challenge.'),		
			topIdent: 30,		
		});	

		/*
		blocks.push({
			type: 'h1',
			value: translate('Use this space to jot down notes and ideas about solving the Unit Challenge.'),
			headerTitle: {
				leftTitle: '',	
				type: 'lamp',
				topWhiteOverlayHeight: 0,
				lineY: 45,
				//chapter: {},
			},
			font: fontsHeading.bold,
			color: colors.unitTitle,
			leftIdent: 120,
			topIdent: 50,
			width: 380,
			fontSize:18,
			headerParams: {
				
			} 
		});*/
		
		
		/*
		blocks.push({
			type: 'custom',
			drawFn: (doc)=>{
				//contentWidth;
				doc.lineJoin('round')
				   .roundedRect(textIdents.left, doc.y, PDFUtils.textWidth-10, 600, 10)
				   .stroke();
			},
		});
		*/
		let currLessonId;

		/* Removed "Phenomena Visuals" section. Files moved to Activity files in the Lesson's chronological order. 
		blocks.push({
			type: 'sectionCover',
			sectionNum: 2,
			title: translate('Phenomena Visuals'),
			contentsTitle: translate('Section')+' 2: '+translate('Phenomena Visuals'),
			text: customPagesGlobal.Section2.content,
			textFontSize:11, 
			image: customPagesGlobal.Section2.image,
			color: colors.unitTitle,
		})	
		
		
		console.log(allWorkShets);
		
		//console.log(customPages.phenomenon);
		const phenomenonFiles=allWorkShets.filter(file=>file.fileTitle.indexOf(phenomenonWord[languageId])>0 && file.type=='pdf');
		
		await asyncForEach(phenomenonFiles, async (file)=>{
			
			let contentsObj;
			//console.log(file);
			if (currLessonId!==file.lesson_id){
				const lesson=lessons.find(l=>l.lesson_id===file.lesson_id);
				if (lesson){
					contentsObj={
						title: translate('Lesson')+' '+lesson.number+' '+translate(lesson.name)+'', 
						level: 1, 
						color: colors.black
					}
					currLessonId=file.lesson_id;
				}
				
			}
			const path=await downloadFile(file.path);
			const imgPaths=await convertPptxPdf(path, file, false, !!argv.firstExport);
			//const imgPaths=await convertPdf(path);
			//console.log(imgPaths);
			let x=textIdents.left;
			const images=[]; 
			const width=465;

			await asyncForEach(imgPaths, async (item)=>{
				const imgInfo=await imageInfo(item.imagePath);
				images.push({
					path: imgInfo.rotated && imgInfo.rotatedPath ? imgInfo.rotatedPath : item.imagePath,
					height: getImgPropheight(imgInfo, width),
					width,
					x
				})
				x+=width;
				if (x>390){
					x=textIdents.left;
				}
			});
			
			blocks.push({
				type: 'lessonFiles',
				value: images,
				file,
				contentsObj,
				leftIdent: 0,
				width: 612,
				bottomBoxY: 725,
				headerParams: {
					//type: 'nameClassDate',
					lineY: 45,
					topWhiteOverlayHeight: 50
				} 
			});
					
		});
		*/
		
		blocks.push({
			type: 'sectionCover',
			sectionNum: 2,
			title: translate('Lesson Files'),
			contentsTitle: translate('Section')+' 2: '+translate('Lesson Files'),
			text: customPagesGlobal.wb_lessonFiles,
			color: colors.unitTitle,
			addNotes: true,
			notesTitle: translate('Use this space to jot down notes and ideas about solving the Unit Challenge.'),
			notesParams: {
				topIdent: 30,
			}
		});
	
		const filenameRaplace={
			'Lección 2.5a-reservas-petroliferas-de-eeuu':'Lección 2.5a-reservas-petroliferas-de-eeuu-fenomeno',
			'Lección 2.18b-cubiertos-plasticos':'Lección 2.18b-cubiertos-plasticos-fenomeno',
			'Lección 2.23a-diferente-calidad-de-aire':'Lección 2.23a-diferente-calidad-de-aire-fenomeno',
		}
		//console.log(unit.chapters);
		//return;
		await asyncForEach(unit.chapters, async chapter=>{
			if (chapter.number!==3){
				//return;
			}
			
			if (languageId===2){
				const row=argv.db==='texas' ? {} : spanishChapterDesc.find(item=>{
					return item.Grade==model.number && item.Unit==unit.number && item.Chapter==chapter.number;
				})
				//console.log(spanishChapterDesc);
				
				chapter.name=chapter.name_spanish || row['Spanish Chapter Name'] || '[Missing Translation of Chapter Name]';// || chapter.name;
				chapter.description=chapter.student_description_spanish || row['ChapterDescriptionStidentSpanish'] || '[Missing Translation of Chapter Description]' ;// || chapter.student_description;
				if (!chapter.name){
					throw new Error(`Missing Spanish translation: Chapter ${chapter.number} Name `);
				}
				if (!chapter.description){
					throw new Error(`Missing Spanish translation: Chapter ${chapter.number} Description`);
				}
			}

			exportInfo.push({
				title: 'Chapter',
				subtitle: `${chapter.number} ${chapter.name}`,				
				link: gnAppUrl+`/chapter/${model.model_id}/${unit.unit_id}/${chapter.id}/`,
				editUrl:  gnAppUrl+'/automation2/curriculum/chapters/'+chapter.id,
				level: 2,
			});

			const files=allWorkShets.filter(file=>{
				const lesson=lessons.find(l=>l.lesson_id===file.lesson_id && chapter.lessons.find(chl=>chl.lesson_id===l.lesson_id));
				if (!lesson){
					console.log('Not Found lesson', file.lesson_id, chapter.name, chapter.lessons.map(chl=>chl.lesson_id));
					//console.log(chapter.lessons);
					return;
				}
				if (filenameRaplace[file.fileTitle]){
					file.fileTitle=filenameRaplace[file.fileTitle];
				}
				console.log('lessonFileWorksheet', lesson.lesson_id, lesson.number, '-', file.fileTitle, file.fileName);
				const excludedEnds=['presentation','transcripts','exit-ticket','key'];
				const isPhenomenon=file.fileTitle.indexOf(phenomenonWord[languageId])>0 && file.type=='pdf';
				file.isPhenomenon=isPhenomenon;				
				return isPhenomenon || (file.worksheet_language_id==languageId
					&& (argv.firstExport || (!argv.firstExport && file.for_student))
					&& file.type==='pdf' 
					&& (!roadMapImg || (roadMapImg && file.id!==roadMapImg.id)) 
					//&& !phenomenonFiles.find(f=>f.id===file.id)
					&& !excludedEnds.find(str=>file.fileNameWithExt.indexOf(str+'.')>0)
					&& !allWorkShets.find(f=>f.fileName===file.fileName && f.type==='pptx'))
			});
			console.log(files.map(f=>f.path));
			
			
			chapter.lessonSequence=`${unit.number}.${chapter.lessons[0].lesson.index+1} - ${unit.number}.${chapter.lessons[chapter.lessons.length-1].lesson.index+1}`;
			blocks.push({
				type: 'sectionCover',
				chapterNum: chapter.number,
				title: translate(chapter.name),
				subTitle: translate('This chapter covers lesson sequence')+` ${chapter.lessonSequence}.`,
				contentsTitle: translate('Chapter')+' '+chapter.number+': '+translate(chapter.name),
				text: chapter['student_description'+(languageId>1 ? '_spanish' : '')] || chapter.description,
				color: colors.unitTitle,
				contentsLevel: 1,
				addNotes: true,
				notesTitle: chapter.number > 1 ? translate('Use this area to jot down chapter-related notes.') : '' /*translate('Use this space to jot down notes and ideas about solving the Unit Challenge.')*/,
				notesParams: {
					svgFileName: 'notes-box3.svg',
					svgTopIdent: 20,
				}
			});		
			[
				{
				  pdf:'rc_pdf_worksheet',
				  gdrive:'rc_pdf_google_drive_object',
				  title: translate('Reading'), //'Reading for Lessons '+chapter.lessonSequence,
				  spanishCSVcolumn: 'Reading link',
				},
				{
				  pdf: 'rc_ques_pdf_worksheet',
				  gdrive:'rc_ques_pdf_google_drive_object',
				  title: translate('Reading Questions'), //'Reading Questions for Lessons '+chapter.lessonSequence
				  spanishCSVcolumn: 'Reading Question link',
				},
				/*
				{
				  pdf: 'rc_ques_key_pdf_worksheet',
				  title: chapter.name && 0 ? chapter.name+' reading questions key' : 'Reading Questions key for Lessons '+chapter.lessonSequence,
				  spanishCSVcolumn: 'Reading Question Key Link',
				},*/
			].forEach(({pdf, title, spanishCSVcolumn, gdrive})=>{
				if (languageId===2){
					pdf+='_spanish';
					gdrive+='_spanish';
				}
				let editUrl='';
				if (chapter[gdrive]){
					console.log(chapter[gdrive]);
					const obj=_.isObject(chapter[gdrive]) ? chapter[gdrive] : JSON.parse(chapter[gdrive]);
					if (obj.exportLinks['application/pdf']){
						chapter[pdf]=obj.exportLinks['application/pdf'];
						editUrl=obj.alternateLink;
					}
				}
				if (chapter[pdf]){					
					const pathArr=chapter[pdf].split('/');
					files.push({
						chapter,
						path: chapter[pdf],
						title: translate('Chapter')+' '+chapter.number+' '+title,
						fileName: pathArr[pathArr.length-1],
						editUrl
					})
				}
				
			});
			if (!files.length){
				return;
			}
			await asyncForEach(files, async file=>{
				let contentsObj;
				//console.log(file);
				if (currLessonId!==file.lesson_id && !file.chapter){
					const lesson=lessons.find(l=>l.lesson_id===file.lesson_id);
					if (lesson){
						contentsObj={
							title: translate('Lesson')+' '+lesson.number+' '+translate(lesson.name)+' '+translate('Files'), 
							level: 2, 
							color: colors.black
						}
						currLessonId=file.lesson_id;
						exportInfo.push({
							title: 'Lesson',
							subtitle: translate('Lesson')+' '+lesson.number+' '+translate(lesson.name)+' '+translate('Files'),							
							link: gnAppUrl+`/lesson/${model.model_id}/${unit.unit_id}/${lesson.lesson_id}/${unit.number}/${lesson.index+1}`,
							editUrl:  gnAppUrl+'/automation2/curriculum/lessons/'+currLessonId,
							level: 3,
						});
					}
					
				}
				else if (file.chapter){
					contentsObj={
						title: file.title, 
						level: 2, 
						color: colors.black
					}
					exportInfo.push({
						title: 'Chapter Worksheet',
						subtitle: file.title,
						link: file.path.indexOf('http')===0 ? file.path : gnAppUrl+'/'+file.path,
						editUrl: file.editUrl,
						level: 3,
					});
					console.log('file.chapter', file);
				}
				//
				console.log('downloadFile', file.path);
				const path=await downloadFile(file.path);
				console.log('downloadFile Done', path);
				if (file.fileName.indexOf('edit?usp=')>=0 || file.fileName.indexOf('?id=')>=0){
					file.fileName=path.split('/')[1];
				}
				if (!file.chapter){
					exportInfo.push({
						title: 'Lesson Worksheet',
						subtitle: file.fileTitle || file.originalname,
						link: file.path.indexOf('http')===0 ? file.path : gnAppUrl+'/'+file.path,
						editUrl: file.editUrl,
						level: 4,
					});
				}				
				const imgPaths=await convertPptxPdf(path, file, false, !!argv.firstExport);
				//const imgPaths=await convertPdf(path);
				//console.log(imgPaths);
				let x=textIdents.left;
				const images=[]; 
				let width=465;

				await asyncForEach(imgPaths, async (item)=>{
					const imgInfo=await getImgInfoAndRotate(item.imagePath);
					console.log('getImgPropheight', imgInfo, getImgPropheight(imgInfo, width));
					
					width=imgInfo.rotated ? 612 : 612

					if (getImgPropheight(imgInfo, width)>700 && imgInfo.rotated){
						//width=getImgPropWidth(imgInfo, 700);
					}
					
					
					images.push({
						path: imgInfo.rotated && imgInfo.rotatedPath ? imgInfo.rotatedPath : item.imagePath,
						height: getImgPropheight(imgInfo, width),
						rotated: imgInfo.rotated,
						width,
						x
					})
					console.log({
						path: imgInfo.rotated && imgInfo.rotatedPath ? imgInfo.rotatedPath : item.imagePath,
						height: getImgPropheight(imgInfo, width),
						rotated: imgInfo.rotated,
						width,
						x
					});
					x+=width;
					if (x>390){
						x=textIdents.left;
					} 
				});
				if (images && images.length && images[0]){
					const width=images[0].width;
					blocks.push({
						type: 'lessonFiles',
						value: images,
						file,
						contentsObj,
						leftIdent: (612-width)/2,
						width,
						height:images[0].height,
						bottomBoxY: images[0].rotated ? 730 : 730,
						rightBoxX: images[0].rotated ? 548 : 600,
						leftBoxWidth: images[0].rotated ? 55 : 0,
						marginTop: file.for_print ? 0 : (images[0].rotated ? (792-images[0].height)/2 : 0),
						headerParams: {
							type: !file.chapter ? (file.isPhenomenon ? 'phenomenon' : (file.for_print ? 'nameClassDate' : 'line')) : 'reading',
							topWhiteOverlayHeight: file.chapter ? 65 : 52,
							lineY: 45,
							title: chapter ? file.title : null,
							chapter
						},
						footerParams: {
							leftText: file.chapter ? file.title+': '+chapter.name : file.fileTitle,
							//hideLine: true
						}
					});
				}
			});	
			blocks.push({
				type: 'notesPage',
				title: translate('Use this area to jot down chapter-related notes.'),				
				svgFileName: 'notes-box3.svg',
				svgTopIdent: 20,
			});	
		})

		/* Removed "End of Unit Study Guide"
		blocks.push({
			type: 'sectionCover',
			sectionNum: 3,
			title: translate('End-of-Unit Study Guide'),
			contentsTitle: translate('Section')+' 3: '+translate('End-of-Unit Study Guide'),
			text: customPagesGlobal.Section4.content,
			color: colors.unitTitle,
		});
		
		let fileNames=[
			'Key-Science-Concepts',
			'Thinking-Visually',
			'Using-Your-Science-Toolkit',
			'Guided-Practice',
			'Key-Vocabulary'
		];
		if (language==='spanish') {
			fileNames=[
				'Conceptos-Cientificos-Clave',
				'Conceptos-Clave-de-la-Ciencia',
				'Pensando-Visualmente',
				'Usando-Tu-Kit-De-Herramientas-de-Ciencia',
				'Usando-Tu-Kit-de-Herramientas-Cientificas',
				'Practica-Guiada',
				'Vocabulario-Clave'
			];
		}
		const renewFiles=unit.reviewWorkshet.filter(file=>{
			console.log(file);
			return file.type==='pdf' && file.fileName && fileNames.find(fName=>file.fileName.indexOf(fName)>0);
		});
		//return;
		console.log('renewFiles', renewFiles);
		let part=0;
		await asyncForEach(renewFiles, async (file, index)=>{

			if (index<1 || index>5){
				//return;
			}
			part++;
			if (!file.title){
				console.log(file);
				//return;
			}
			
			let contentsObj={
				title: file.title || file.fileTitle, 
				level: 1, 
				color: colors.black
			};

			const path=await downloadFile(file.path);
			const imgPaths=await convertPptxPdf(path, file, false, !!argv.firstExport);
			//const imgPaths=await convertPdf(path);
			console.log(imgPaths);
			let x=0;
			const images=[]; 
			const width=465;

			await asyncForEach(imgPaths, async (item)=>{
				const imgInfo=await imageInfo(item.imagePath);
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
			
			// blocks.push({
			// 	type: 'h1',
			// 	headerTitle: {titleLeft: 'Part 5: Unit Vocabulary', hideLine:true, showThoughtStartIcon: false},
			// 	startOnRightSide: false,
			// 	color: colors.unitTitle,
			// });
			
			blocks.push({
				type: 'lessonFiles',
				value: images,
				file,
				contentsObj,
				leftIdent: 0,
				width: 612,
				bottomBoxY: images[0].rotated ? 800 : 735,
				firstPageMove:-30,
				headerParams: {
					//titleLeft: 'Part '+part+': '+file.title, hideLine:true, showThoughtStartIcon: false,
					lineY: 45,
					topWhiteOverlayHeight: 65
				}
			});
			
			// images.forEach(image=>{
			// 	blocks.push({
			// 		type: 'h1',
			// 		headerTitle: {titleLeft: file.title, hideLine:true, showThoughtStartIcon: false},
			// 		startOnRightSide: false,
			// 		color: colors.unitTitle,
			// 	});
			// 	if (contentsObj){
			// 		blocks.push({
			// 			type: 'contentsPush',
			// 			...contentsObj
			// 		})
			// 	}				
			// 	blocks.push({
			// 		type: 'image',
			// 		value: image.path,
			// 		width: contentWidth,
			// 		align: 'center'
			// 	});
			// });	
				
		});
		*/
		blocks.push({
			type: 'sectionCover',
			sectionNum: 3,
			title: translate('Unit Vocabulary'),
			contentsTitle: translate('Section')+' 3: '+translate('Unit Vocabulary'),
			text: customPagesGlobal.wb_unitVocabulary,
			color: colors.unitTitle,
			addNotes: true,
			notesTitle: translate('Use this area to jot down chapter-related notes.'),
			notesParams: {
				svgFileName: 'notes-box3.svg',
				svgTopIdent: 20,
			},
			image: 'images/vocabulary-graphic-bigger'+(languageId===2 ? '_spanish' : '')+'.png'
		});
		
		if (unit.vocab.length){
			
			blocks.push({
				type: 'h1',
				headerTitle: {titleLeft: translate('Unit Vocabulary')},
				startOnRightSide: false,
				//fontSize: 11,
				color: colors.unitTitle,
			});		
			blocks.push({
				type: 'contentsPush',
				title: translate('Unit Vocabulary'), 
				level: 1, 
				color: colors.unitTitle,
			});	
			
			const vocab=unit.vocab.filter(item=>item.word && item.definition);
			const vocabWordGroups=_.groupBy(vocab, v=>v.word[0]);
			//let vocabHtml='';
			const vocabLetters=[];
			_.each(vocabWordGroups, (words, letter)=>{
				let vocabHtml='';
				words.forEach(item=>{
					vocabHtml+='<p><strong>'+item.word+'</strong> - '+item.definition.trim()+'</p>';
				})	
				vocabLetters.push({
					letter,
					vocabHtml
				})
			})
			
						
			await asyncForEach(vocabLetters, async item=>{

				blocks.push({
					type: 'h2',
					//headerTitle: {titleLeft: title},
					startOnRightSide: false,
					titleColor: colors.unitTitle,
					fontSize: 24,
					value: item.letter,
					marginBottom: 0.000001,
				});		

				await asyncForEach(parse(item.vocabHtml).childNodes, async (el)=>{
					await parseHTMLIntoBlocks(el, {
						ident: 0,
						moveDown: 0.5,
						width: 525,
						fontSize: 12,
						lineGap: 5
					}, blocks);
				});
			})
			
		}
		/*
		const addPages=customPagesGlobal.AdditionalResources;
		
		const addPagesTitles=[translate('Science and Engineering Practices'), translate('Crosscutting Concepts')];
		const addPagesY=[
			70, 85
		]
		await asyncForEach(addPages['SEP-CCC-Images'+(language==='spanish' ? '_'+language : '')], async (img, index)=>{
			console.log(img);
			const title=addPagesTitles[index];
			const field='text'+(index+1);
			blocks.push({
				type: 'h1',
				headerTitle: {titleLeft: title},
				startOnRightSide: false,
				color: colors.unitTitle,
			});		
			blocks.push({
				type: 'contentsPush',
				title: title, 
				level: 1, 
				color: colors.black,
			});	
			blocks.push({
				type: 'image',
				value: img.imagePath,
				width: 550,
				x:31,
				y:addPagesY[index]
			});	
			await processObjectFieldsIntoBlocks(addPages, [
				{title: '', field, 
					params: {
					
					}
				},			
			], blocks);	
			
		});
		
		/**/
	}
	
	console.log('Preparing content blocks...');
	await generateBlocks();
	console.log('Created '+blocks.length+' blocks');
	
	//console.log('Generating temp PDF file...');
	//PDFUtils.generatePdf('temp.pdf', blocks);
	//fs.unlinkSync('./temp.pdf');
	
	const pdfFileName=argv.destPath || 'Workbook '+model.display_name+' Unit '+unit.number+(languageId >1 ? '('+language+')' : '')+'.pdf';
	console.log('Generating publication PDF '+pdfFileName+'...');

	PDFUtils.generatePdf(pdfFileName, blocks, true, disableImages ? true : false);
	const queueData=loadQueue();
	const queueItem=(queueData || []).find(item=>item.id===queueItemId);
	if (queueItem){
		queueItem.totalPageNumber=PDFUtils.totalPageNumber;
		console.log('queueItem', queueItem);
		fs.writeFileSync(`logs/${queueItemId}.json`, JSON.stringify(exportInfo, null, 4));
		queueItem.exportInfoCreated=true;
		saveQueue(queueData);
	}
	console.log(JSON.stringify(allMessages, null, 4));	
	console.log(exportInfo);
}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})