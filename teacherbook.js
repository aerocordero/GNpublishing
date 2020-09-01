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
		GDFolderSync,
		getImgInfoAndRotate,
		loadQueue,
		saveQueue
	} = require('./lib/utils');
	const { materialsQtySet } = require('./lib/greenninja');
	const PDFUtilsObj  = require('./lib/pdf-utils');
	
	console.log('Google Drive folder syncing...')
	//console.log(argv);
	if (argv.gdSync || argv.gdSync===undefined){
		await GDFolderSync('19sNmj1BXrBWV6M2JTL4r-lJp5Iw8n-96', 'teacherbook');
	}
	
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
	const printLessonNum=argv.lesson;
	const queueItemId=argv.queueItemId;
	const disableImages=argv.disableImages;
	console.log(queueItemId);
	
	const customPages=await initCustomPages(__dirname+'/gdrive/teacherbook');
	
	console.log('Loading data...');
	
	const model=(await dbQuery([
		'SELECT * FROM `model` t',
		'WHERE t.`model_id` = ?'
	], [modelId]))[0];
	
	const unit=(await dbQuery([
		'SELECT * FROM `unit` t',
		'WHERE t.`unit_id` = ?'
	], [unitId]))[0];
	unit.files=[];
	unit.number=model.unit_id.split(',').indexOf(unit.unit_id+"")+1;
	
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
	});
	
	unit.reviewWorkshet=await dbQuery([
		'SELECT *',
		'FROM unit_worksheet_mapping m',
		'JOIN worksheet_unit_review t ON m.worksheet_unit_review_id = t.worksheet_unit_review_id',
		'WHERE m.unit_id = ? AND t.worksheet_language_id=1 '
	], [unitId]);
	const reviewFilesRoot=parse(unit.review[0].files).querySelectorAll('li');
	unit.reviewWorkshet.forEach(item=>{
		const pathArr=item.path.split('/');
		item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
		item.fileNameWithExt=item.fileName+'.'+item.type;
		item.fileTitle=item.fileName;
		
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
	const standardTypes=['pe', 'ccc', 'ccm', 'ccl', 'sep', 'dci', 'eld'];
	unit.orphanStandards={};
	unit.commonCoreStandards={};	
	standardTypes.forEach(key=>{
		unit.orphanStandards[key]=[];
		unit.commonCoreStandards[key]=[];		
	})
	
	const epConcepts=(await dbQuery([
		'SELECT * FROM `EP_concepts` t'
	], []))[0];
	
	await asyncForEach(lessons, async (lesson)=>{
		lesson.pe=await dbQuery([
			'SELECT *, pe.title, lpm.progressions, pe.pe_id, pe.description, pe.statements',
			'FROM lesson_pe_mapping_new lpm',
			'JOIN PE_NEW pe ON lpm.pe_id = pe.pe_id',
			'WHERE lpm.lesson_id = ? and lpm.hidden = false   '
		], [lesson.lesson_id]);
		lesson.ccc=await dbQuery([
			'SELECT *',
			'FROM lesson_ccc_mapping_new m',
			'JOIN CCC_NEW_copy t ON m.ccc_id = t.id',
			'JOIN pe_ccc pe ON pe.ccc_id = t.id',
			'WHERE m.lesson_id = ?',
			'GROUP BY m.ccc_id',
			'ORDER BY t.short_title'
		], [lesson.lesson_id]);
		lesson.ccm=await dbQuery([
			'SELECT *',
			'FROM lesson_ccm_mapping_new m',
			'JOIN CCM_NEW t ON m.ccm_id = t.id',
			'WHERE m.lesson_id = ?',
			'GROUP BY m.ccm_id',
			//'ORDER BY t.short_title'
		], [lesson.lesson_id]);
		lesson.ccm=_.sortBy(lesson.ccm, item=>item.priority);
		lesson.ccl=await dbQuery([
			'SELECT *',
			'FROM lesson_ccl_mapping_new m',
			'JOIN CCL_NEW t ON m.ccl_id = t.id',
			'WHERE m.lesson_id = ?',
			'GROUP BY m.ccl_id',
			//'ORDER BY t.short_title'
		], [lesson.lesson_id]);		
		lesson.ccl=_.sortBy(lesson.ccl, item=>item.priority);
		
		lesson.dci=await dbQuery([
			'SELECT *',
			'FROM lesson_dci_mapping_new m',
			'JOIN DCI_NEW_copy t ON m.dci_id = t.id',
			'JOIN pe_dci pe ON pe.dci_id = t.id',
			'WHERE m.lesson_id = ?',
			'GROUP BY m.dci_id',
			'ORDER BY t.short_title'
		], [lesson.lesson_id]);
		lesson.dci=_.sortBy(lesson.dci, item=>item.priority);
		lesson.sep=await dbQuery([
			'SELECT *',
			'FROM lesson_sep_mapping_new m',
			'JOIN SEP_NEW_copy t ON m.sep_id = t.id',
			'JOIN pe_sep pe ON pe.sep_id = t.id',
			'WHERE m.lesson_id = ?',
			'GROUP BY m.sep_id',
			'ORDER BY short_title'
		], [lesson.lesson_id]);		
		lesson.sep=_.sortBy(lesson.sep, item=>item.priority);
		lesson.eld=await dbQuery([
			'SELECT *',
			'FROM lesson_eld_mapping_new m',
			'JOIN ELD_NEW t ON m.eld_id = t.id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);		
		lesson.eld=_.sortBy(lesson.eld, item=>item.priority);
		lesson.epc=await dbQuery([
			'SELECT *',
			'FROM lesson_epc_mapping m',
			'JOIN environmental_principle_copy t ON m.environmental_principle_id = t.environmental_principle_id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);		
		lesson.eld=_.sortBy(lesson.eld, item=>item.priority);
		
		lesson.worksheet=await dbQuery([
			'SELECT *',
			'FROM lesson_worksheet_mapping m',
			'JOIN worksheet t ON m.worksheet_id = t.worksheet_id',
			'WHERE m.lesson_id = ? AND t.type NOT IN ("docx", "doc", "rtf", "xlsx", "txt") AND t.worksheet_language_id=1'
		], [lesson.lesson_id]);
		lesson.worksheet=_.sortBy(lesson.worksheet, item=>item.type!=='pptx');
		
		lesson.activityPlan=await dbQuery([
			'SELECT *',
			'FROM activity_plan t',
			'WHERE t.lesson_id = ?',
			'ORDER BY t.header'
		], [lesson.lesson_id]);
		lesson.vocab=await dbQuery([
			'SELECT *',
			'FROM lesson_vocab_mapping m',
			'JOIN vocab t ON m.vocab_id = t.vocab_id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);		
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
	});
	standardTypes.forEach(key=>{
		unit.orphanStandards[key]=_.sortBy(unit.orphanStandards[key], item=>item.title);
		unit.commonCoreStandards[key]=_.sortBy(unit.commonCoreStandards[key], item=>item.title);
	});
	//console.log(unit);
	//return;
	
	const allWorkShets=[];	
	
	const unitLessonIds=unit.lessons.split(',');
	
	const lessonWorkshetTextReplace=(lesson, obj, fields)=>{
		obj.files=[];
		fields.forEach(field=>{
			//console.log(obj[field]);
			obj[field]=obj[field].replace(new RegExp('\(\{\{([a-zA-Z0-9\-\+\$@]+)\}\}([a-zA-Z0-9\-\.]+)\)', 'igm'), (match, str, old_lesson_id, str1, str2)=>{
				//console.log('old_lesson_id', old_lesson_id, str);
				const fileLesson=lessons.find(l=>l.old_lesson_id===old_lesson_id);
				if (!fileLesson){
					return str;
				}
				//console.log('regexp_'+field, match, str, str1);
				const workshet=fileLesson.worksheet.find(file=>file.fileNameWithExt===str1.trim());
				//console.log(workshet);
				if (!workshet){
					console.log('Workshet "'+str1+'" is not found');
					//console.log('regexp_'+field, match, str, str1);
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
	
	lessons.forEach(lesson=>{
		lesson.pe.forEach(item=>{
			item.lessons=lessons.filter(l=>l.pe.find(p=>p.pe_id===item.pe_id && !p.orphan && !p.hidden) && l.lesson_id!==lesson.lesson_id).map(l=>l.number).join(', ');
		});
		lesson.worksheet.forEach(item=>{
			const pathArr=item.path.split('/');
			item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
			item.fileNameWithExt=item.fileName+'.'+item.type;
			item.fileTitle='Lesson '+lesson.number+item.fileNameWithExt;
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
		});
		lesson.worksheet=_.sortBy(lesson.worksheet, file=>file.fileName);
		//console.log(lesson.worksheet);
		lesson.activityPlan.forEach(item=>{
			item.files=[];
			lessonWorkshetTextReplace(lesson, item, ['content']);			
			//console.log(item.content);
		});
		lessonWorkshetTextReplace(lesson, lesson, ['anticipated_challenges', 'teacher_prep']);
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
		return nameArr;
	};
	
	let materials={};
	['materialLsKit', 'materialLsTeacher', 'materialLsOptional'].map(key=>{
		const rawData=materialData[key];
		materials[key]=_.sortBy(_.values(_.groupBy(rawData, m=>m.material_id)).map(materials=>{	
			const item=materials[0];
			const items=materialData.materialsListUnitOverview.filter(m=>m.material_id===item.material_id);

			let quantity=parseFloat(item.totalQty);
			
		
		
			items.forEach(item=>{
				//quantity+=(parseFloat(item.quantity) || 0);
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
	//console.log(materials); return;
	
	console.log('Loaded Unit "'+unit.name+'" and '+lessons.length+' lessons');
	await closeDbConnection();
	
	const PDFUtils=new PDFUtilsObj(colors, fonts, textIdents);		
	
	PDFUtils.textWidth=490;
	const contentWidth=540;	
	
	PDFUtils.tocStyles={
		title: {
			color: 'black',
			idents: [textIdents.left-10, 40],
			font: fonts.bold,
			fontSize: 24,
		},
		level0: {
			font: fonts.bold,
			fontSize: 12,
		},
		level1: {
			font: fonts.regular,
			fontSize: 10,
		},
		leftIdent: textIdents.left-10,
		levelIdent: 5,
		width: contentWidth-45,
		lineParams: {
			leftIdent: textIdents.left-10,
			width: contentWidth+20
		}
	}
	PDFUtils.headerTextStyles={
		h1: {
			fontSize: 17,
			font: fonts.regular,
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
	
	PDFUtils.convertHtml=(text)=>{
		const unitLessonIds=unit.lessons.split(',')
		return decodeHtml(text).replace(/\\n/g, '').replace(/\{\{([^\s]+)\}\}/g, (match, id)=>{
			//console.log(match, id);
			const item=lessons.find(l=>l.old_lesson_id===id);
			if (item){
				return 'Lesson '+item.number+' '+item.name;
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
			value:'How a Unit Works - Teacher and Student Perspective',
			startOnRightSide: false,
			startOnNewPage: true,
			noHeader:true,
			color: colors.lessonGreen,
			leftIdent: 55,
			fontSize: 20,
			paddingBottom: 0.5,
			align: 'center',
			width: 500,
		});
		
		await processObjectFieldsIntoBlocks(customPages.HowUnitWorks, [
			{title: '', field:'content'},
		], blocks);
		
		blocks.push({
			type: 'image',
			value: customPages.HowUnitWorks.image,
			width: 380,
			align: 'center',
			marginTop: 1
		});
		
		blocks.push({
			type: 'h1',
			value:'Differentiation Learning Support',
			startOnNewPage: true,
			startOnRightSide: false,
			noHeader:true,
			color: colors.lessonGreen,
			leftIdent: 55,
			fontSize: 20,
			paddingBottom: 0.5,
			align: 'center',
			width: 509,
		});
		
		await processObjectFieldsIntoBlocks(customPages.DifferentiationLearningSupport, [
			{title: 'Differentiation and Special Learning Needs', field:'differentiation', 
				params: {
					width: 509,
					leftTextIdent: 55,
					moveDown: 0.5,
					//lineGap: 0.6,
				}
			},
			{title: 'Creating a Climate for Differentiated Instruction', field:'creating-a-climate', 
				params: {
					processListsAsBlocks: true,
					width: 509,
					leftTextIdent: 55,
					addSpaceAfterSize: 7,
					//lineGap: 0.6,
					moveDown: 0.5,
				}
			},
			{title: 'Additional Support for Differentiated Learning', field:'additional-support', 
				params: {
					processListsAsBlocks: true,
					width: 509,
					leftTextIdent: 55,
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
			{title: 'Science in Action', field:'science_in_action_description', breakAfter: true, headerType:'h1'},
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
			{title: 'Assessment', field: 'assessment', headerType:'h1'},
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
			{title: 'Technology and Teaching', field: 'tech_teaching', 
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

		
		await processObjectFieldsIntoBlocks(unit, [
			{title: '', field:'ngss_description'},
			//{title: 'Safety Guidelines', field:'materials_safety_guidelines'},
		], blocks);
		
		if (unit.orphanStandards.pe && unit.orphanStandards.pe.length){
			blocks.push({
				type: 'h2',
				value: 'Unit Performance Expectations',
			});
			
			let peHtml='';
			_.sortBy(unit.orphanStandards.pe, s=>s.title).forEach(item=>{
				peHtml+='<p><strong>'+item.title+':</strong> '+item.description+'<br/></p>';
			})				
			await asyncForEach(parse(peHtml).childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el, {
					ident: 0,
					brFontSize: 1
				}, blocks);
			});
		}
		const standards=[
			{
				title: 'SCIENCE AND ENGINEERING PRACTICES',
				type: 'sep'
			},
			{
				title: 'DISCIPLINARY CORE IDEAS',
				type: 'dci'
			},
			{
				title: 'CROSSCUTTING CONCEPTS',
				type: 'ccc'
			},		
		];
		//console.log(unit.commonCoreStandards);
		if (standards.filter(c=>unit.orphanStandards[c.type] && unit.orphanStandards[c.type].length).length){
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
		standards.forEach(c=>{
			const items=unit.orphanStandards[c.type] || [];
			if (items.length){
				//console.log('c.title', c.title);
				blocks.push({
					type: 'h3',
					value: c.title,
					isHtml:false,
					font: fonts.regular,
					ident: 0,
					marginTop: 1,
					marginBottom: 0.001,
					params:{
						marginTop: 0.1,
						//marginBottom: 0.001,
					}
					
				});
				const itemCategoryGroups=_.groupBy(_.sortBy(items, item=>item.category && item.category!=='default'), item=>item.category);
				//const categories=[];
				_.each(itemCategoryGroups, (items, category)=>{
					if (category && category!=='default'){
						//console.log('category', category);
						blocks.push({
							type: 'h4',
							value: category,
							isHtml:false,
							ident: 0,
							marginTop: 0.5,
							marginBottom: 0.001,
						});
					}
					else {
						/*
						blocks.push({
							type: 'lineBreak',
						});
						*/

					}
					//console.log('items', _.keys(_.groupBy(items, item=>item.title)));
					blocks.push({
						type: 'list',
						value: _.keys(_.groupBy(items, item=>item.title)),
						notMoveDownAfter: false
					});
				});				
			}
		})
		//return;
		
		await processObjectFieldsIntoBlocks(unit, [
			{title: 'Common Core and CA ELD Standards', field:'common_core', headerType:'h1', breakAfter: true, params:{
				dontChangeCurrentTitle: true,
				//startOnNewPage: true,
			}},
			//{title: 'Safety Guidelines', field:'materials_safety_guidelines'},
		], blocks);
		
		
		const coreStandards=[
			{
				title: 'COMMON CORE - ELA/Literacy',
				type: 'ccl'
			},
			{
				title: 'COMMON CORE - Mathematics',
				type: 'ccm'
			},
			{
				title: 'CA ELD',
				type: 'eld'
			},		
		];		
				
		coreStandards.forEach(c=>{
			const items=unit.commonCoreStandards[c.type] || [];
			if (items.length){
				blocks.push({
					type: 'p',
					value: c.title+'\n',
					isHtml:false,
					params: {
						moveDown: 0.2
					}
				});				
				const itemCategoryGroups=_.groupBy(items, item=>item.category);
				_.each(itemCategoryGroups, (items, category)=>{
					if (category && category!=='default'){
						blocks.push({
							type: 'p',
							value: '<em>'+category+'</em>',
							isHtml:false,
							ident: 0,
						});
					}
					blocks.push({
						type: 'list',
						value: _.keys(_.groupBy(_.sortBy(items, item=>item.priority), item=>item.title)),
						notMoveDownAfter: true
					});
				});	
				blocks.push({
					type: 'p',
					value: ' ',
					isHtml:false,
				});			
			}
		});
		
		await processObjectFieldsIntoBlocks(unit, [
			{title: "California's Environmental Principles and Concepts", field:'epc_description', headerType:'h1', 
				params:{
				dontChangeCurrentTitle: true
			}},
		], blocks);
		
		let epcHtml='<p><br/></p><ul>';
		unit.epc.forEach(item=>{
			epcHtml+='<li>'+item.title+'</li>';
		})		
		epcHtml+='</ul>'		
		await asyncForEach(parse(epcHtml).childNodes, async (el)=>{
			await parseHTMLIntoBlocks(el, {
				ident: 0,
				brFontSize: 1
			}, blocks);
		});
		
		
				
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
				}
			},
			{title: 'Science and Engineering Practice (SEP)', field:'sep', 
				headerType: 'h3',
				params: {
					marginTop: 0.6,
					titleColor: colors.green,
					lineGap: 0.4,
				}
			},
			{title: 'Crosscutting Concepts (CCC)', field:'ccc', 
				headerType: 'h3',
				params: {
					marginTop: 0.6,
					titleColor: colors.green,
					lineGap: 0.4,
				}
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
				},
			],
			data: lessons.map(lesson=>{
				lesson.ep=[];
				

				return {
					lesson: 'Lesson '+lesson.number,
					pe: lesson.pe.map(item=>item.title || item.short_title).join(', '),
					sep: lesson.sep.map(item=>item.short_title).join(', '),
					dci: lesson.dci.map(item=>item.short_title).join(', '),
					ccc: lesson.ccc.map(item=>item.short_title).join(', '),
					epc: lesson.epc.map(item=>(item.short_title || item.title).split('-')[0]).join(', '),
				}
			})
		})
		//return;
		
	
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
	
		await processObjectFieldsIntoBlocks(model, [
			{title: '', field:'materials_desc'},
			{title: 'Safety Guidelines', field:'materials_safety_guidelines', headerType:'h1'},
		], blocks);
	
		//'materialLsKit', 'materialLsTeacher', 'materialLsOptional'
		//console.log('materials.materialLsKit', materials.materialLsKit);
		[{
			title: 'Materials Provided by School/Teacher:',
			data: materials.materialLsTeacher,
			headerType: 'h1',
			startOnNewPage: true
		},
		{
			title: 'Optional Materials',
			data: materials.materialLsOptional,
			headerType: 'h2'
		},
		{
			title: 'Materials in Green Ninja Kit:',
			data: materials.materialLsKit,
			headerType: 'h1'
		}].filter(mat=>mat.data.length).forEach(mat=>{
			//console.log(mat.data);
			blocks.push({
				type: mat.headerType || 'h2',
				value: mat.title
			})
			
			
	
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
						}*/
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
				data: mat.data
			})
		});
		
		const materialsSupLegenda=[
			{val: 1, text: 'items that students are encouraged to bring in from home'},
			{val: 2, text: 'items that will run out eventually'},
			{val: 3, text: 'replacements items in Green Ninja kit'},
			{val: 4, text: 'items included in Green Ninja kit'},
			{val: 5, text: 'optional materials'},
		];

	
		const tableDescr=parse(
			materialsSupLegenda.map((item, index)=>{
				return '<sup>'+item.val+'</sup> — '+item.text+(index < materialsSupLegenda.length-1 ? '<br />\n' : '')
			}).join('')
		);

		await parseHTMLIntoBlocks(tableDescr, {
			stuckWithPrevious: true,
			fitToPage: true
		}, blocks);
		//console.log(tableDescr);			
		
		await asyncForEach(unit.review, async (review)=>{
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
			/*
			blocks.push({
				type: 'h2',
				value: 'Content', 
			});
			blocks.push({
				type: 'p',
				value: 'You can use the following resources either as a review toward the end of the unit, or during the unit to supplement particular topics. Resources below requires online access.', 
				isHtml: false,
			});	
			*/		
			
			await asyncForEach(_.sortBy(review.activityPlan, p=>p.header), async (plan)=>{
				await processObjectFieldsIntoBlocks(plan, [
					{title: plan.header, field:'content', params: {
						replaceFn: (str)=>{
							const string=str.replace(new RegExp('\\(\\{\\{'+unit.unit_id+'\\}\\}([a-zA-Z0-9\-\.]+)\\)', 'igm'), (match, str, str1, str2)=>{					
								return '('+str+')';
							});
							return string;
						}
					}},
				], blocks);				
			});		
		});		
	
		
		
		//return;
		blocks.push({
			type: 'sectionCover',
			title: 'Lesson Guides',
			image: 'images/lesson-guides.jpg',
			color: colors.lessonGreen,
			addContents: true,
		});
	//	return;
		
		await asyncForEach(lessons.filter((l, i)=>{
			//return i<13 && i>=11;
			return printLessonNum ? l.number==printLessonNum : true;
		}), async (lesson)=>{
			//console.log('lessonlesson', lesson);
			let header={
				titleLeft: 'Lesson '+lesson.number+' '+lesson.name, 
				titleRight: '', 
				icon: 'images/icons/Lesson Plan.png',
				color: colors.lessonGreen
			};
			
			PDFUtils.showedFiles=[];
			let worksheetFromAnotherLessons=[];
			
			const workshetReplaceFn=(str, params)=>{
				//console.log('forRegexp: ', str);
				let images=[];
				const string=str.replace(/\(%([\d]+)%\)/igm, (match, str, str1, str2)=>{					
					//console.log('regexp2', match, str, str1);
					const workshet=allWorkShets.find(file=>file.worksheet_id==str);
					//console.log(workshet);
					if (workshet){
						if (PDFUtils.showedFiles.indexOf(workshet.fileNameWithExt)<0){
							(workshet.images || []).forEach(img=>images.push(img));
						}
						if (workshet.images && workshet.images.length && !params.dontShowImagesAfter){
							PDFUtils.showedFiles.push(workshet.fileNameWithExt);
						}
						if (workshet.lesson_id!==lesson.lesson_id && !worksheetFromAnotherLessons.find(w=>w.worksheet_id===workshet.worksheet_id)){
							//console.log('workshetworkshet', workshet);
							worksheetFromAnotherLessons.push(workshet);
						}
						return workshet.fileTitle+' ('+(workshet.isOnline ? customPages.messages.onlineContent : (workshet.inlinePageRef || 'online access'))+')';
					}
					return '';
				}).replace(/\) \(from /igm, '; from ').replace(/\( from /igm, '; from ');
				if (string.indexOf('; from ')>0){
					images=[];
				}
			
				return {
					string,
					images
				};
			}
			worksheetFromAnotherLessons=[];
			lesson.activityPlan.filter(p=>!parseInt(p.student)).forEach(plan=>{
				workshetReplaceFn(plan.content, {});
			});
			//console.log(lesson.number);
			//console.log('worksheetFromAnotherLessons', worksheetFromAnotherLessons)
			
			blocks.push({
				type: 'h1',
				value: 'Lesson Introduction',
				headerTitle: header,
				startOnRightSide: true,
				startOnNewPage: true
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
					marginTop: 0.5
					//ident:100,
					//width: 350
				}},
				{title: 'Learning Objectives', field:'objectives', headerType:'h3', params: {
					marginTop: 0.5
					//ident:100,
					//width: 350
				}},
			], blocks);
			
			blocks.push({
				type: 'contentsPush',
				title: 'Lesson '+lesson.number+' '+lesson.name, 
				level: 1, 
				color: colors.black
			});
			
			
			blocks.push({
				type: 'h1',
				value: 'Teaching Resources'
			});	
			
			//console.log('lesson.worksheet', lesson.worksheet);
			if (lesson.worksheet.length || worksheetFromAnotherLessons.length){
				
				blocks.push({
					type: 'h2',
					value: 'Files'
				});
				const lessonFiles=lesson.worksheet.filter((file, index)=>{
					const existing=lesson.worksheet.find((f, i)=>f.fileName===file.fileName && i < index);
					return !existing;
				});
				worksheetFromAnotherLessons.forEach(file=>{
					lessonFiles.push(file);					
				});
				let hasOnlineIcons=!!lessonFiles.find(f=>f.isOnline);
				let hasStudentIcons=!!lessonFiles.find(f=>(f.for_student || f.fileTitle.indexOf('phenomenon.pdf')>0) && f.type==='pdf');
			
				blocks.push({
					type: 'table',
					fontSize: 10,
					hideHeaders: true,
					borderColor: colors.lessonGreen,
					//leftIdent: 80,
					columns: [
						{
							id: 'fileTitle',
							header: false,
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
							header: '',
							width: 155,
							renderer: function (tb, data) {								
								return data.page || 'Online Access Required';
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
								if ((data.for_student || data.fileTitle.indexOf('phenomenon.pdf')>0) && data.type==='pdf'){
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
		
			if (lesson.materials.length){
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
			}			
		
			
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
				const materials=materialDataRaw.filter(m=>m.lesson_id===lesson.lesson_id).filter(item=>(item.plural_name || item.name) && item.forWhomInd==forWhomInd);
				//console.log(materials);
				if (forWhomInd!=2){
					materialGroups.push({
						title,
						materials
					});
				}
				else {
					[
						{
							val: 4,
							title: 'For each group of 4 students',	
						},
						{
							val: 3,
							title: 'For each group of 3 students',	
						},
						{
							val: 2,
							title: 'For each pair of students',	
						},
						{
							val: 1,
							title: 'For each student',	
						},
					].forEach(item=>{
						const stGroupMaterials=materials.filter(m=>m.group_size==item.val);
						materialGroups.push({
							title:item.title,
							materials: stGroupMaterials
						})
					})
				}
				
			})
			
			materialGroups.forEach(({title, materials})=>{
				//console.log('materialGroups', title, materials);

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
						if (nameArr){
								nameArr.forEach(t=>{
								let tag='span';
								if (t.params && t.params.features && t.params.features.indexOf('sups')>=0){
									tag='sup';
									if (lessonMaterialLegenda.indexOf(t.text)<0){
										lessonMaterialLegenda.push(t.text);
									}
									
								}
								nameStr+='<'+tag+'>'+t.text+'</'+tag+'>';
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
						
						return {
							matName: nameStr.replace('\n', ' '),
							name: quantity + nameStr.replace('\n', ' '),
							optionalInd: item.optionalInd,
							addons: [
								{
									label:'Notes',
									field: 'notes'
								},
								{
									label:'Alternative',
									field: 'alternative'
								},
							].filter(a=>item[a.field]).map(a=>a.label+': '+item[a.field])
						};
					});
					let listHtml='<ul>';
					_.sortBy(materialsArr, m=>!!m.optionalInd).forEach(m=>{
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
						//dontShowImagesAfter: true,
					}
				},
			], blocks);
			//return;
		
			blocks.push({
				type: 'h1',
				value: 'Lesson Plan',
				//headerTitle: header,
				paddingBottom: 0.2
			});
		
			let planTotalTime=0;
			const proceedFile=async (file)=>{
				console.log(file)
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
					let width=155;
					
					await asyncForEach(imgPaths, async (item, imgIndex)=>{
						const imgInfo=await getImgInfoAndRotate(item.imagePath);
						console.log(item.imagePath, imgInfo);
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
						images.push({
							path: imgInfo.rotated && imgInfo.rotatedPath ? imgInfo.rotatedPath : item.imagePath,
							height: getImgPropheight(imgInfo, width),  
							width,
							x,
							highlight: imgIndex===0 && file.isOnline ? {
								color: colors.orange,
								icon: icons.onlineContent
							} : null,
						})
						x+=width;
						
					});
					//console.log(images);
					file.images=[{
						type: 'images',
						value: images,
						width: width,
						firstRowHeight: images[0].height,
						addBorder: true,
						dontAttachParagraphToImage: false,
					}];
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
						title: plan.header.trim(), 
						field:'content', 
						titleRight: '~ '+plan.time, 
						headerType: 'lessonPlanHeader',
						params: {
							resetCurentH2: true,
							replaceFn: workshetReplaceFn,
							processListsAsBlocks: true,
							planIndex,
							imgParams: {
								width: 155,
								align: 'center'
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
				blocks.push({
					type: 'lessonPlanHeader',
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
							align: 'center'
						}
					}
				},
			], blocks);

			const backgroundForTeachersBlocks=[
				{title: 'Content Knowledge', field:'background', headerType: 'h2',
					params: {
						imgParams: {
							width: 400,
							align: 'center',
							//fitToPage: true,
						}
					}
				},
				{title: 'Access and Equity', field:'access_equity', headerType: 'h2'},
				{title: 'Home to School Connections', field:'home_to_school', headerType: 'h2'},
				{title: 'Student Prior Experience', field:'prior_experience', headerType: 'h2'},
				{title: 'Student Preconceptions', field:'student_preconceptions', headerType: 'h2'},
			];
			if (backgroundForTeachersBlocks.find(bl=>lesson[bl.field])){
				blocks.push({
					type: 'h1',
					value: 'Background for Teachers',
				});
				await processObjectFieldsIntoBlocks(lesson, backgroundForTeachersBlocks, blocks);
			}
			
			const lessonStandards=lesson.pe.filter(item=>!item.orphan && !item.hidden);
			
			if (lessonStandards.length){
				blocks.push({
					type: 'h1',
					value: 'Standards',
					paddingBottom: 0.2
				})
	
				blocks.push({
					type: 'table',
					fontSize: 10,
					columns: [
						{
							id: 'title',
							header: 'Performance Expectation(s)',
							width: 155,
							align: 'center',
						},
						{
							id: 'progressions',
							header: 'Progression',
							width: 155,
							align: 'center',
							renderer: function (tb, data) {	
								let str=data.progressions;							
								return str/*.replace('Culminating-Experience', 'Culminating Experience')*/;
							},
						},
						{
							id: 'lessons',
							header: 'Lessons building to PE(s)',
							width: 155,
							align: 'center',
						},
					],
					data: lessonStandards
				});
				//console.log('lesson.pe', lesson.pe);
			}
			
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
			})
		
			if (otherStandards.find(st=>st.items.length)){
				blocks.push({
					type: 'h3',
					value: 'Connections to Other NGSS Standards',
					font: fonts.bold,
					ident: 0,
					marginTop: 0
				});
				let cccHtml='';
				//cccHtml+='<p><strong>Connections to Other NGSS Standards</strong></p>';
				cccHtml+='<p>The below PE(s), SEP(s), DCI(s), and CCC(s) are emphasized in this lesson but are not associated with the above PE(s).</p>';
				//cccHtml+='<p>Crosscutting Concept(s)</p>';				
				await asyncForEach(parse(cccHtml).childNodes, async (el)=>{
					await parseHTMLIntoBlocks(el, {}, blocks);
				});
				
				await asyncForEach(otherStandards.filter(st=>st.items.length), async (st)=>{
					blocks.push({
						type: 'h3',
						value: st.title,
						isHtml:false,
						font:fonts.regular,
						ident: 0,
					});
					
					let itemListsHtml='<ul>';
					
				
					st.items.forEach(item=>{
						//console.log('Lesson_'+st.type, item);
						itemListsHtml+='<li>'+item.title;
						itemListsHtml+='<ul><li>'+item.description+'</li></ul>';
						itemListsHtml+='</li>';
					});
					itemListsHtml+='</ul>'
					
					await asyncForEach(parse(itemListsHtml).childNodes, async (el)=>{
						await parseHTMLIntoBlocks(el, {}, blocks);
					});
				});
			}
			
			const commonCoreStandards=[
				{title: 'COMMON CORE - ELA/Literacy', field:'ccl'},
				{title: 'COMMON CORE - Mathematics', field:'ccm'},
				{title: 'CA ELD', field:'eld'}
			];
			commonCoreStandards.forEach(st=>{
				st.items=lesson[st.field] || [];
			})
			const lessonCCStandards=commonCoreStandards.filter(st=>st.items.length);
			
			if (lessonCCStandards.length){
				blocks.push({
					type: 'h2',
					value: 'Common Core and CA ELD Standards',
					//marginTop: 0.001,
					paddingBottom: 0.0001
				});
				await processObjectFieldsIntoBlocks(lesson, [
					{title: '', field:'common_core'},
				], blocks);
		
				lessonCCStandards.forEach((st, index)=>{
					if (st.items.length){
						blocks.push({
							type: 'h3',
							value: st.title,
							font: fonts.regular,
							marginTop: index > 0 || lesson.common_core ? 0.8 : 0.0001,
							isHtml:false,
							isTitle: true
						});
		
						blocks.push({
							type: 'list',
							value: st.items.map(item=>item.title),
							ident: 20,
							notMoveDownAfter: index+1 < lessonCCStandards.length ? true : false
						});
					}
				});
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
				{title: 'Tying It All Together', field:'all_together', headerType: 'h1'},
				{title: 'Safety Guidelines', field:'safety_guidelines', headerType: 'h1'},
				{title: 'Extension', field:'extensions', headerType: 'h1'},
			], blocks);
		
			
			
			/*
			
			*/
		
		
		
		
			if (lesson.number==='1.6'){

			}
		
		});
		//return; 
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
				&& (printLessonNum ? lesson.number==printLessonNum : true)
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

	fs.unlinkSync('./temp.pdf');
	
	const pdfFileName=argv.destPath || 'TC '+model.display_name+' Unit '+unit.number+'.pdf';
	console.log('Generating publication PDF '+pdfFileName+'...');
	//PDFUtils.generatePdf('output.pdf', blocks);
	PDFUtils.generatePdf(pdfFileName, blocks, true, disableImages ? true : false);
	const queueData=loadQueue();
	const queueItem=(queueData || []).find(item=>item.id===queueItemId);
	if (queueItem){
		queueItem.totalPageNumber=PDFUtils.totalPageNumber;
		console.log('queueItem', queueItem);
		saveQueue(queueData);
	}
}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})