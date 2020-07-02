/*
	Workshet preview generate requires graphicsmagick binary installed in the system
	Mac Os installation: `brew install graphicsmagick`
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
	
	const config = require('./config.json');
	
	const {
		decodeHtml,
		asyncForEach,
		downloadFile,
		convertImage,
		imageInfo,
		getImgPropHeigth,
		dbQuery,
		closeDbConnection,
		convertPdf,
		processObjectFieldsIntoBlocks,
		parseHTMLIntoBlocks,
		cleanUpHTML,
		initCustomPages
	} = require('./lib/utils');
	const { materialsQtySet } = require('./lib/greenninja');
	const PDFUtilsObj  = require('./lib/pdf-utils');
	
	//config.db.Promise=bluebird;
	
	const colors={
		unitTitle: '#15ADCB',
		green: '#6FAC44',
		lessonGreen: '#89C440',
		lessonFiles: '#FF5609',
		brown: '#634439',
		black: 'black',
		blue: '#26adca'
	}
	
	const textIdents={
		left: 77,
		top: 85
	}
	
	const fonts={
		regular: 'fonts/Muli-Regular.ttf',
		bold: 'fonts/Muli-Bold.ttf',
		semiBold: 'fonts/Muli-SemiBold.ttf',
		italic: 'fonts/Muli-Italic.ttf',
		boldItalic: 'fonts/Muli-BoldItalic.ttf',
	}
	
	
	
	console.log('Connected to the DB');
	
	const modelId=19;
	const unitId=35;
	const printLessonNum=argv.lesson;
	const customPages=initCustomPages(__dirname+'/custom-pages');
	
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
		'WHERE t.`unit_id` = ?'
	], [unitId]));
	
	await asyncForEach(unit.review, async (item)=>{
		item.activityPlan=await dbQuery([
			'SELECT *',
			'FROM unit_review_activity_plan t',
			'WHERE t.unit_review_id = ?'
		], [item.unit_review_id]);
	});
	
	unit.reviewWorkshet=await dbQuery([
		'SELECT *',
		'FROM unit_worksheet_mapping m',
		'JOIN worksheet_unit_review t ON m.worksheet_unit_review_id = t.worksheet_unit_review_id',
		'WHERE m.unit_id = ? AND t.worksheet_language_id=1'
	], [unitId]);
	const reviewFilesRoot=parse(unit.review[0].files).querySelectorAll('li');
	unit.reviewWorkshet.forEach(item=>{
		const pathArr=item.path.split('/');
		item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
		item.fileNameWithExt=item.fileName+'.'+item.type;
		item.fileTitle=item.fileName;
		
		const node=reviewFilesRoot.find(n=>n.rawText.indexOf(item.fileName)>=0);				
		
		item.textIndex=unit.review[0].files.indexOf(item.fileName);
		if(node){
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
			'SELECT pe.title, lpm.progressions, pe.pe_id, pe.description, pe.statements',
			'FROM lesson_pe_mapping_new lpm',
			'JOIN PE_NEW pe ON lpm.pe_id = pe.pe_id',
			'WHERE lpm.lesson_id = ? and lpm.hidden = false'
		], [lesson.lesson_id]);
		lesson.ccc=await dbQuery([
			'SELECT *',
			'FROM lesson_ccc_mapping_new m',
			'JOIN CCC_NEW t ON m.ccc_id = t.id',
			'JOIN pe_ccc pe ON pe.ccc_id = t.id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);
		lesson.ccm=await dbQuery([
			'SELECT *',
			'FROM lesson_ccm_mapping_new m',
			'JOIN CCM_NEW t ON m.ccm_id = t.id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);
		lesson.ccm=_.sortBy(lesson.ccm, item=>item.priority);
		lesson.ccl=await dbQuery([
			'SELECT *',
			'FROM lesson_ccl_mapping_new m',
			'JOIN CCL_NEW t ON m.ccl_id = t.id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);		
		lesson.ccl=_.sortBy(lesson.ccl, item=>item.priority);
		
		lesson.dci=await dbQuery([
			'SELECT *',
			'FROM lesson_dci_mapping_new m',
			'JOIN DCI_NEW t ON m.dci_id = t.id',
			'JOIN pe_dci pe ON pe.dci_id = t.id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);
		lesson.dci=_.sortBy(lesson.dci, item=>item.priority);
		lesson.sep=await dbQuery([
			'SELECT *',
			'FROM lesson_sep_mapping_new m',
			'JOIN SEP_NEW t ON m.sep_id = t.id',
			'JOIN pe_sep pe ON pe.sep_id = t.id',
			'WHERE m.lesson_id = ?'
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
			'JOIN environmental_principle t ON m.environmental_principle_id = t.environmental_principle_id',
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
			obj[field]=obj[field].replace(new RegExp('\(\{\{([^\s]+)\}\}([a-z\-\.]+)\)', 'igm'), (match, str, old_lesson_id, str1, str2)=>{
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
				}
				if (workshet){
					if (lesson.lesson_id===fileLesson.lesson_id){
						obj.files.push(workshet);
					}					
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
			item.lessons=lessons.filter(l=>l.pe.find(p=>p.pe_id===item.pe_id)).map(l=>l.number).join(', ');
		});
		lesson.worksheet.forEach(item=>{
			const pathArr=item.path.split('/');
			item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
			item.fileNameWithExt=item.fileName+'.'+item.type;
			item.fileTitle='Lesson '+lesson.number+item.fileNameWithExt;
			item.isOnline=item.fileName.indexOf('checkpoint')>0;
			if (item.isOnline){
				item.page='Online Dynamic Content';
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
	
	const PDFUtils=new PDFUtilsObj(colors, fonts, textIdents);		
	
	PDFUtils.headerTitles=[
		{titleLeft: 'Unit '+unit.number+':', titleRight: 'Unit Overview', icon: 'images/icons/Unit Overview.png'},
		{titleLeft: 'Unit '+unit.number+':', titleRight: 'Standards', icon: 'images/icons/Standards.png'},
		{titleLeft: 'Unit '+unit.number+':', titleRight: 'Materials', icon: 'images/icons/Materials.png'},
		{titleLeft: 'Unit '+unit.number+':', titleRight: 'Unit Resources', icon: 'images/icons/Unit Resources.png'},		
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
			noHeader:true,
			color: colors.lessonGreen,
			leftIdent: 30,
			fontSize: 20,
		});
		
		await processObjectFieldsIntoBlocks(customPages['how-a-unit-works'], [
			{title: '', field:'content'},
		], blocks);
		
		blocks.push({
			type: 'image',
			value: customPages['how-a-unit-works'].image,
			width: 380,
			align: 'center'
		});
		
		blocks.push({
			type: 'h1',
			value:'Differentiation Learning Support',
			startOnRightSide: false,
			noHeader:true,
			color: colors.lessonGreen,
			leftIdent: 30,
			fontSize: 20,
		});
		
		await processObjectFieldsIntoBlocks(customPages['differentiation-learning-support'], [
			{title: 'Differentiation and Special Learning Needs', field:'differentiation', 
				params: {
					width: 545,
					leftTextIdent: 35,
					lineGap: 0.6,
				}
			},
			{title: 'Creating a Climate for Differentiated Instruction', field:'creating-a-climate', 
				params: {
					processListsAsBlocks: true,
					width: 545,
					leftTextIdent: 35,
					lineGap: 0.6,
				}
			},
			{title: 'Additional Support for Differentiated Learning', field:'additional-support', 
				params: {
					processListsAsBlocks: true,
					width: 545,
					leftTextIdent: 35,
					lineGap: 0.6,
				}
			},					
		], blocks);		
		
		blocks.push({
			type: 'h1',
			value:'Unit Overview',
			startOnRightSide: false,
		});
		blocks.push({
			type: 'contentsPush',
			title: 'Unit Overview', 
			level: 1, 
			color: colors.black
		});
		blocks.push({
			type: 'h2',
			value:'Introduction',
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
			{title: 'Unit Storyline', field:'student_unit_storyboard'},
			{title: 'Unit Roadmap', field:'unit_roadmap'},
			{title: 'Science Background', field:'background_description'},
			{title: 'Science in Action', field:'science_in_action_description', breakAfter: true},
			{title: 'Green Ninja Connections', field: 'connections_description', breakAfter: true},
			{title: 'Home to School Connections', field: 'home_to_school',
				params: {
					//processListsAsBlocks: true,
					//lineGap: 1.6,
				}
			},
			{title: 'Prior Knowledge', field: 'prior_knowledge', breakAfter: true},
			{title: 'Assessment', field: 'assessment'},
			{title: 'Identifying Preconceptions', field: 'identifying_preconceptions'},
			{title: 'Access and Equity', field: 'access_and_equity'},
			{title: 'Engineering Connections', field: 'eng_connections'},
			{title: 'Resources'},
			{title: 'Outside Educational Resources', field: 'outside_resources', headerType: 'h3', 
				params: {
					listsIdent: 13
				}
			},
			{title: 'Supplemental Resources', field: 'supplemental_resources', headerType: 'h3', 
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
			headerTitle: PDFUtils.headerTitles.find(t=>t.titleRight==='Standards')
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
		console.log(unit.commonCoreStandards);
		if (standards.filter(s=>unit.orphanStandards[s] && unit.orphanStandards[s].length).length){
			let cccHtml='';
			cccHtml+='<p><strong>Connections to Other NGSS Standards</strong></p>';
			cccHtml+='<p>The additional PE(s), SEP(s), DCI(s), and CCC(s) provided below are introduced or emphasized in the lessons in this unit.</p>';
			//cccHtml+='<p>Crosscutting Concept(s)</p>';				
			await asyncForEach(parse(cccHtml).childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el, {}, blocks);
			});
		}
		standards.forEach(c=>{
			const items=unit.orphanStandards[c.type] || [];
			if (items.length){
				blocks.push({
					type: 'h3',
					value: c.title,
					isHtml:false,
					ident: 0,
					marginTop: 1
				});
				const itemCategoryGroups=_.groupBy(items, item=>item.category);
				_.each(itemCategoryGroups, (items, category)=>{
					if (category && category!=='default'){
						blocks.push({
							type: 'h4',
							value: category,
							isHtml:false,
							ident: 0,
						});
					}
					blocks.push({
						type: 'list',
						value: _.keys(_.groupBy(items, item=>item.title)),
						ident: 15,
						notMoveDownAfter: true
					});
				});				
			}
		})
		
		await processObjectFieldsIntoBlocks(unit, [
			{title: 'Common Core and CA ELD Standards', field:'common_core', headerType:'h1', breakAfter: true, params:{
				dontChangeCurrentTitle: true
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
						value: _.keys(_.groupBy(items, item=>item.title)),
						ident: 15,
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
			{title: 'California`s Environmental Principles and Concepts', field:'epc_description', headerType:'h1', 
				params:{
				dontChangeCurrentTitle: true
			}},
		], blocks);
		
		
				
		blocks.push({
			type: 'h2',
			value: 'NGSS LESSON MAPPING LEGEND',
			headerTitle: PDFUtils.headerTitles.find(t=>t.titleRight==='Standards')
		});
		
		await processObjectFieldsIntoBlocks(customPages['ngss-lesson-mapping'], [
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
					width: 71,
				},
				{
					id: 'dci',
					header: 'DCI',
					align: 'left',
					width: 71,
				},
				{
					id: 'ccc',
					header: 'CCC',
					align: 'left',
					width: 71,
				},
				{
					id: 'epc',
					header: 'EP&C',
					align: 'left',
					width: 71,
				},
			],
			data: lessons.map(lesson=>{
				lesson.ep=[];
				const getTitle=(type, title)=>{
					const obj=customPages.standards[type+'-title-mapping'] || {};
					const vals=_.values(obj);
					const index=vals.indexOf(title);
					return index>=0 ? _.keys(obj)[index] : title;
				}
				return {
					lesson: 'Lesson '+lesson.number,
					pe: lesson.pe.map(item=>getTitle('pe', item.title)).join(', '),
					sep: lesson.sep.map(item=>getTitle('sep', item.title)).join(', '),
					dci: lesson.dci.map(item=>getTitle('dci', item.title)).join(', '),
					ccc: lesson.ccc.map(item=>getTitle('ccc', item.title)).join(', '),
					epc: lesson.epc.map(item=>getTitle('epc', item.title).split('-')[0]).join(', '),
				}
			})
		})
	
		blocks.push({
			type: 'h1',
			value: 'Materials'
		});
		blocks.push({
			type: 'contentsPush',
			title: 'Materials', 
			level: 1, 
			color: colors.black
		});
	
		await processObjectFieldsIntoBlocks(model, [
			{title: 'Materials List Information', field:'materials_desc'},
			{title: 'Safety Guidelines', field:'materials_safety_guidelines'},
		], blocks);
	
		//'materialLsKit', 'materialLsTeacher', 'materialLsOptional'
		[{
			title: 'Materials Provided by School/Teacher:',
			data: materials.materialLsTeacher
		},
		{
			title: 'Optional Materials',
			data: materials.materialLsOptional,
			headerType: 'h3'
		},
		{
			title: 'Materials in Green Ninja Kit:',
			data: materials.materialLsKit,
			headerType: 'h2'
		}].filter(mat=>mat.data.length).forEach(mat=>{
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
						width: 110,
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
						width: 90,
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
						width: 110,
					},
				],
				data: mat.data
			})
		})
	
		const tableDescr=parse(`<sup>1</sup> — items that students are encouraged to bring in from home <br /><sup>2</sup> — items that will run out eventually <br /><sup>3</sup> — replacements items in Green Ninja kit <br /><sup>4</sup> — items included in Green Ninja kit <br />`);

		await parseHTMLIntoBlocks(tableDescr, {}, blocks);
		//console.log(tableDescr);			
		
		
		
		await asyncForEach(unit.review, async (review)=>{
			await processObjectFieldsIntoBlocks(review, [
				{title: review.name, field:'description', headerType:'h1'},
			], blocks);
			blocks.push({
				type: 'contentsPush',
				title: 'Unit Resources', 
				level: 1, 
				color: colors.black
			});
			blocks.push({
				type: 'h2',
				value: 'Content', 
			});
			blocks.push({
				type: 'p',
				value: 'You can use the following resources either as a review toward the end of the unit, or during the unit to supplement particular topics.', 
				isHtml: false,
			});			
			
			await asyncForEach(review.activityPlan, async (plan)=>{
				await processObjectFieldsIntoBlocks(plan, [
					{title: plan.header, field:'content'},
				], blocks);				
			});		
		});		
	
		
		
	
		blocks.push({
			type: 'sectionCover',
			title: 'Lesson Guides',
			image: 'images/lesson-guides.jpg',
			color: colors.lessonGreen,
			addContents: true,
		});

	
		await asyncForEach(lessons.filter(l=>{
			return printLessonNum ? l.number==printLessonNum : true;
		}), async (lesson)=>{
			
			let header={
				titleLeft: 'Lesson Introduction', 
				titleRight: 'Lesson '+lesson.number, 
				icon: 'images/icons/Lesson Plan.png',
				color: colors.lessonGreen
			};
			
			const workshetReplaceFn=(str)=>{
				//console.log('forRegexp: ', str);
				return str.replace(/\(%([\d]+)%\)/igm, (match, str, str1, str2)=>{					
					//console.log('regexp2', match, str, str1);
					const workshet=allWorkShets.find(file=>file.worksheet_id==str);
					//console.log(workshet);
					if (workshet){
						return workshet.fileTitle+' ('+workshet.inlinePageRef+')';
					}
					return '';
				}).replace(/\) \(from /igm, '; from ');
			}
			
			blocks.push({
				type: 'h1',
				value: 'Lesson '+lesson.number+' '+lesson.name,
				headerTitle: header,
				paddingBottom: 0.1,
				addContents: true,
				startOnRightSide: true,
			});
		
			await processObjectFieldsIntoBlocks(lesson, [
				{title: '', field:'description'},
				{title: 'Phenomenon', field:'phenomenon'},
				{title: 'Learning Objectives', field:'objectives'},
			], blocks);
		
			
			if (lesson.worksheet.length){
				blocks.push({
					type: 'h2',
					value: 'Files'
				});
			
				blocks.push({
					type: 'table',
					fontSize: 10,
					hideHeaders: true,
					borderColor: colors.lessonGreen,
					columns: [
						{
							id: 'fileTitle',
							header: false,
							width: 310,
							align: 'left',
							padding: [4,30,4,4],
							renderer: function (tb, data) {								
								return data.fileTitle;
							},
							cellAdded: (tb, data, cell, pos)=>{
								console.log(tb, data);
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

						},
						{
							id: 'page',
							header: '',
							width: 155,
						},
					],
					data: lesson.worksheet.filter((file, index)=>{
						const existing=lesson.worksheet.find((f, i)=>f.fileName===file.fileName && i < index);
						return !existing;
					}),
				});
				lesson.worksheet.forEach(file=>{
					if (!unit.files.find(f=>f.fileName===file.fileName)){
						unit.files.push(file);
					}
				});
			}
			
			await processObjectFieldsIntoBlocks(lesson, [
				{title: 'Links', field:'links'},
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
		
			
		
			['For the teacher', 'For each student', 'For each group of 4 students'].forEach((title, forWhomInd)=>{
				const materials=lesson.materials.filter(item=>(item.plural_name || item.name) && item.forWhomInd===forWhomInd);
				if (materials.length){
					blocks.push({
						type: 'h3',
						value: title,
					});
			
					blocks.push({
						type: 'list',
						value: materials.filter(item=>item.name).map(item=>{
							return (item.quantity ? parseFloat(item.quantity)+' - ' : '')+item.name.replace('\n', ' ');
						}),
						ident: 20,
					});
				}
			})
		
			
		
			await processObjectFieldsIntoBlocks(lesson, [
				{title: 'Teacher Prep', field:'teacher_prep', 
					params: {
						listsIdent: 13,
						replaceFn: workshetReplaceFn,
					}
				},
			], blocks);
		
		
			blocks.push({
				type: 'h2',
				value: '',
				headerTitle: {
					titleLeft: 'Lesson Plan', 
					titleRight: 'Lesson '+lesson.number, 
					icon: 'images/icons/Lesson Plan.png',
					color: colors.lessonGreen
				},
				paddingBottom: 0.0
			});
		
		
			await asyncForEach(lesson.activityPlan.filter(p=>!p.student), async (plan)=>{
				//console.log(plan);
				await processObjectFieldsIntoBlocks(plan, [
					{
						title: plan.header.trim(), 
						field:'content', 
						titleRight: '~ '+plan.time, 
						headerType: 'lessonPlanHeader',
						params: {
							resetCurentH2: true,
							replaceFn: workshetReplaceFn,
						}
					},
				], blocks);
				await asyncForEach(plan.files, async (file)=>{
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
						const width=232;
						if (imgPaths.length === 1){
							x+=109;
						}
						await asyncForEach(imgPaths, async (item)=>{
							const imgInfo=await imageInfo(item.imagePath);
							images.push({
								path: item.imagePath,
								heigth: getImgPropHeigth(imgInfo, width),
								width,
								x
							})
							x+=width;
							if (x>390){
								x=textIdents.left;
							}
						});
					
						blocks.push({
							type: 'images',
							value: images,
							width: 200,
							dontAttachParagraphToImage: true,
						});
					}
					if (file.type==='pptx'){
						const pptData=await convertPptxPdf(path, file);
						//console.log(pptData);
						await asyncForEach(pptData, async (item)=>{
							const imgInfo=await imageInfo(item.imagePath);
							blocks.push({
								type: 'pptSlide',
								value: item,
								file,
								imgInfo,
								dontAttachParagraphToImage: true,
							});
						});
					}
				});
				blocks.push({
					type: 'line',
				});
			});
		
			await processObjectFieldsIntoBlocks(lesson, [
				{
					title: 'Teacher Tips', 
					field:'anticipated_challenges',
					params: {
						replaceFn: workshetReplaceFn,
					}
				},
			], blocks);



			blocks.push({
				type: 'h1',
				value: 'Background for Teachers',
				headerTitle: {
					titleLeft: 'Teacher Resources', 
					titleRight: 'Lesson '+lesson.number, 
					icon: 'images/icons/Lesson Plan.png',
					color: colors.lessonGreen
				},
				paddingBottom: 0.1,
				addContents: false,
				startOnRightSide: false,
			});
			
			await processObjectFieldsIntoBlocks(lesson, [
				{title: 'Content Knowledge', field:'background'},
				{title: 'Access and Equity', field:'access_equity'},
				{title: 'Home to School Connections', field:'home_to_school'},
				{title: 'Safety Guidelines', field:'safety_guidelines'},
				{title: 'Student Prior Experience', field:'prior_experience'},
				{title: 'Student Preconceptions', field:'student_preconceptions'},
			], blocks);
			
			if (lesson.pe.length){
				blocks.push({
					type: 'h2',
					value: 'NGSS Standards'
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
						},
						{
							id: 'lessons',
							header: 'Lessons building to PE(s)',
							width: 155,
							align: 'center',
						},
					],
					data: lesson.pe
				})
			}
		
			if (lesson.ccc.length){
				let cccHtml='';
				cccHtml+='<p><strong>Connections to Other NGSS Standards</strong></p>';
				cccHtml+='<p>The below PE(s), SEP(s), DCI(s), and CCC(s) are emphasized in this lesson but are not associated with the above PE(s).</p>';
				cccHtml+='<p>Crosscutting Concept(s)</p>';				
				await asyncForEach(parse(cccHtml).childNodes, async (el)=>{
					await parseHTMLIntoBlocks(el, {}, blocks);
				});
				lesson.ccc.forEach(ccc=>{

					blocks.push({
						type: 'p',
						value: ccc.title,
						isHtml:false,
						ident: 25,
					});
		
					blocks.push({
						type: 'list',
						value: [ccc.description],
						ident: 50,
					});
				});
			}
		
			await processObjectFieldsIntoBlocks(lesson, [
				{title: 'Common Core and CA ELD Standards', field:'common_core'},
			], blocks);
		
			[
				{title: 'COMMON CORE - ELA/Literacys', field:'ccl'},
				{title: 'COMMON CORE - Mathematics', field:'ccm'},
			].forEach(item=>{
				if (lesson[item.field] && lesson[item.field].length){
				
					blocks.push({
						type: 'p',
						value: item.title,
						isHtml:false,
						isTitle: true
					});
		
					blocks.push({
						type: 'list',
						value: lesson[item.field].map(item=>item.title),
						ident: 20,
					});
				}
			});
		
			if (lesson.vocab && lesson.vocab.length){
				blocks.push({
					type: 'h2',
					value: 'Vocabulary',
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
				{title: 'Tying It All Together', field:'all_together'},
				{title: 'Extension', field:'extensions'},
			], blocks);
		
			
			
			/*
			
			*/
		
		
		
		
			if (lesson.number==='1.6'){

			}
		
		});
	
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
		await asyncForEach(unit.files.filter(file=>file.type==='pdf'), async (file)=>{
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
			console.log(imgPaths);
			let x=textIdents.left;
			const images=[];
			const width=465;

			await asyncForEach(imgPaths, async (item)=>{
				const imgInfo=await imageInfo(item.imagePath);
				images.push({
					path: item.imagePath,
					heigth: getImgPropHeigth(imgInfo, width),
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
				contentsObj
			});
		});
		
	}	
	
	console.log('Preparing content blocks...');
	await generateBlocks();
	console.log('Created '+blocks.length+' blocks');
	
	console.log('Generating temp PDF file...');
	PDFUtils.generatePdf('temp.pdf', blocks);
	
	console.log('Generating publication PDF...');
	PDFUtils.generatePdf('output.pdf', blocks);
	PDFUtils.generatePdf('TC '+model.display_name+' Unit '+unit.number+'.pdf', blocks);
}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})