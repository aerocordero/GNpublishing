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
		initCustomPages,
		getImgInfoAndRotate,
		parseHtml,
		flushCache
	} = require('./lib/utils');
	const { materialsQtySet } = require('./lib/greenninja');
	const PDFUtilsObj  = require('./lib/pdf-utils');
	
	if (argv.flushCache){
		flushCache();
	}
	
	//config.db.Promise=bluebird;
	
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
		regular: 'fonts/Muli-Regular.ttf',
		bold: 'fonts/Muli-Bold.ttf',
		semiBold: 'fonts/Muli-SemiBold.ttf',
		italic: 'fonts/Muli-Italic.ttf',
		boldItalic: 'fonts/Muli-BoldItalic.ttf',
		arial: 'fonts/arial-unicode-ms.ttf', 
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
	
	const unit=(await dbQuery([
		'SELECT * FROM `unit` t',
		'WHERE t.`unit_id` = ?'
	], [unitId]))[0];
	unit.files=[];
	unit.number=model.unit_id.split(',').indexOf(unit.unit_id+"")+1;
	if (gradeColors[model.display_name]){
		colors.unitTitle=gradeColors[model.display_name];
	}
	//console.log(unit);
	//return
	const customPagesGlobal=await initCustomPages(gdAssetsPath+"Custom Pages");
	//console.log(customPagesGlobal);
	//return;
	
	//const customPages=await initCustomPages(gdAssetsPath+model.display_name+" Unit "+unit.number+" Assets");
	console.log(customPagesGlobal);
	unit.review=(await dbQuery([
		'SELECT * FROM `unit_review` t',
		'WHERE t.`unit_id` = ?'
	], [unitId]))[0];
	
	unit.reviewWorkshet=await dbQuery([
		'SELECT *',
		'FROM unit_worksheet_mapping m',
		'JOIN worksheet_unit_review t ON m.worksheet_unit_review_id = t.worksheet_unit_review_id',
		'WHERE m.unit_id = ? AND t.worksheet_language_id=1'
	], [unitId]);
	const reviewFilesRoot=parse(unit.review.files).querySelectorAll('li');
	unit.reviewWorkshet.forEach(item=>{
		const pathArr=item.path.split('/');
		item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
		item.fileNameWithExt=item.fileName+'.'+item.type;
		item.fileTitle=item.fileName;
		
		const node=reviewFilesRoot.find(n=>n.rawText.indexOf(item.fileName)>=0);				
		
		item.textIndex=unit.review.files.indexOf(item.fileName);
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
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);
		lesson.dci=_.sortBy(lesson.dci, item=>item.priority);
		lesson.sep=await dbQuery([
			'SELECT *',
			'FROM lesson_sep_mapping_new m',
			'JOIN SEP_NEW t ON m.sep_id = t.id',
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
	
	let allWorkShets=[];	
	
	const unitLessonIds=unit.lessons.split(',');
	
	const lessonWorkshetTextReplace=(lesson, obj, fields)=>{
		//obj.files=[];
		fields.forEach(field=>{
			obj[field]=obj[field].replace(new RegExp('\(\{\{([^\s]+)\}\}([a-z\-\.]+)\)', 'igm'), (match, str, old_lesson_id, str1, str2)=>{
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
		lesson.index=unitLessonIds.indexOf(lesson.old_lesson_id);
		lesson.number=unit.number+'.'+(lesson.index+1);
		lesson.worksheet.forEach(file=>{
			allWorkShets.push(file);
		})
	});

	lessons=_.sortBy(lessons, l=>l.index);
	unit.vocab=[];
	lessons.forEach(lesson=>{
		lesson.pe.forEach(item=>{
			item.lessons=lessons.filter(l=>l.pe.find(p=>p.pe_id===item.pe_id)).map(l=>l.number).join(', ');
		});
		lesson.worksheet.forEach(item=>{
			const pathArr=item.path.split('/');
			item.fileName=pathArr[pathArr.length-1].replace('.'+item.type, '');
			item.fileNameWithExt=item.fileName+'.'+item.type;
			item.fileTitle='Lesson '+lesson.number+''+item.fileName;
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
	console.log(unit);
	
	const PDFUtils=new PDFUtilsObj(colors, fonts, textIdents);	
	const contentWidth=540;	
	
	PDFUtils.textWidth=contentWidth-10;
	PDFUtils.defaultFontSize=11;
	PDFUtils.tocStyles={
		title: {
			color: colors.unitTitle,
			idents: [textIdents.left, 40],
			font: fonts.bold,
			fontSize: 24,
		},
		level0: {
			font: fonts.regular,
			fontSize: 12,
		},
		level1: {
			font: fonts.regular,
			fontSize: 10,
		},
		leftIdent: textIdents.left+10,
		levelIdent: 5,
		width: contentWidth-textIdents.left,
		lineParams: {
			leftIdent: textIdents.left,
			width: contentWidth+20
		}
	}
	
	PDFUtils.headerTitles=[

	];	
	
	PDFUtils.writeHeader=(doc, header)=>{
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
		
		if (header.type==='nameClassDate'){			
			lineY=45;		
			
			doc
			  .font(fonts.regular)
			  .fontSize(12)
			  .fillColor('black')
			  .text('Name', textIdents.left-10, 25, {
				width: 50,
				align: 'left'
			  });
			  
			doc
			  .font(fonts.regular)
			  .fontSize(12)
			  .fillColor('black')
			  .text('Class', textIdents.left+290, 25, {
				width: 50,
				align: 'left'
			  });
			  
			doc
			  .font(fonts.regular)
			  .fontSize(12)
			  .fillColor('black')
			  .text('Date', textIdents.left+410, 25, {
				width: 50,
				align: 'left'
			  });
			
		}
		
		
		//doc.x=60;
	  
		doc
		  .font(fonts.semiBold)
		  .fontSize(24)
		  .fillColor(header.color || colors.unitTitle)
		  .text(header.titleLeft, textIdents.left-10, 30, {
		  	width: contentWidth,
		  	align: 'left'
		  });
		
		if (header.showThoughtStartIcon){
			doc
				.image('images/icons/ThoughtStarterIcon.png', contentWidth-150+textIdents.left, 20, {
				  width: 150,
				  align: 'right',
				  valign: 'top'
				});
		}
	  
	  	if (!header.hideLine){
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
	
	PDFUtils.writeFooter=(doc, pageNum, startPagingPage, footerData)=>{
		const lineY=753;
		const lineWidth=2;
		const hideLine=footerData && footerData.hideLine;
		
		if (pageNum%2===0){
			doc
			.font(fonts.regular)
			.fontSize(12)
			.fill('black')
			.text(pageNum, textIdents.left-10, lineY-7, {
				width: 465,
				continued: false,
				align: 'left'
			});
			
			if(!hideLine){
				doc
				  .save()
				  .moveTo(textIdents.left+16, lineY)
				  //.lineTo(50, 40)
				  .lineTo(contentWidth+textIdents.left-10, lineY)
				  .lineTo(contentWidth+textIdents.left-10, lineY+lineWidth)
				  .lineTo(textIdents.left+16, lineY+lineWidth)
				  .fill(colors.unitTitle);	
			 
				doc
				.font(fonts.arial)
				.fontSize(6)
				.fill('black')
				.text('© '+((new Date()).getYear()+1900)+' Green Ninja', textIdents.left-10, lineY+5, {
					width: contentWidth,
					continued: false,
					align: 'right'
				});
			}
			
		}
		else {
			doc
			.font(fonts.regular)
			.fontSize(12)
			.fill('black')
			.text(pageNum, textIdents.left-10, lineY-7, {
				width: contentWidth,
				continued: false,
				align: 'right'
			});
			
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
		}
		
		if (footerData){
			doc
			  .font(fonts.regular)
			  .fontSize(8)
			  .lineGap(-0.5)
			  .text(footerData.leftText || footerData.centerText, textIdents.left+50, lineY+8, {
			  	width: contentWidth-100,
				continued: false,
				align: 'center'
			  });
		}
	}
	
	PDFUtils.writeSectionCover=(doc, {title, image, color, contentsTitle, sectionNum, text, textFontSize})=>{
		PDFUtils.currentTitle=null;				
		doc.addPage();
		if (PDFUtils.isRightPage()){
			PDFUtils.drawActions.setFooter(doc, {hideLine:true});
			doc.addPage();			
		}
		const top=200;
		doc.x=60;
		
		if (sectionNum){
			doc
			  .font(fonts.bold)
			  .fontSize(24)
			  .fill(color)
			  .text('Section '+sectionNum, textIdents.left, top, {
				width: PDFUtils.textWidth,
				align: 'center'
			  });
		  
			  doc
			  .save()
			  .moveTo(300, top+50)
			  //.lineTo(50, 40)
			  .lineTo(320, top+50)
			  .lineTo(320, top+52)
			  .lineTo(300, top+52)
			  .fill(color);		
		}

		doc
		  .font(fonts.regular)
		  .fontSize(36)
		  .fill(color)
		  .text(title, textIdents.left, top+60, {
			width: PDFUtils.textWidth,
			align: 'center'
		  });
		
		if (text){
			doc.y+=30;
			parseHtml(text.trim()).childNodes.forEach(node=>{
				PDFUtils.drawActions.p(doc, {
					value: node.childNodes,
					isHtml:true,
					parentEl: node,
					params: {
						ident: 100,
						width: 340,
						fontSize: textFontSize || 11,
						listsIdent: 15,
						processListsAsBlocks: true,
					}
				})
			})
			
		}
		if (image){
			//doc.y-=15;
			console.log(image);
			PDFUtils.drawActions.image(doc, {
				value: image,
				width: 340,
				align: 'center'
			})
			
		}
		  
		

		

		if (contentsTitle){
			PDFUtils.drawActions.contentsPush(doc, {title:contentsTitle, level:0, color});
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
		console.log(customPagesGlobal.StudentHighlight.pages[coverIndex]);
		
		blocks.push({
			type: 'pageBreak',
		});	
		
		blocks.push({
			type: 'image',
			value: customPagesGlobal.StudentHighlight.pages[coverIndex].imagePath,
			width: 610,
			x:-1,
			y:-1
		});	
		
		blocks.push({
			type: 'sectionCover',
			sectionNum: 0,
			title: 'About This Workbook',
			contentsTitle: null,
			text: customPagesGlobal.About.content,
			//textFontSize:12, 
			color: colors.unitTitle,
		});
		
		blocks.push({
			type: 'contents',
		});
		
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
			title: 'Introduction',
			contentsTitle: 'Section 1: Introduction',
			text: customPagesGlobal.Section1.content,
			//textFontSize:12, 
			color: colors.unitTitle,
		})
		
		blocks.push({
			type: 'h1',
			headerTitle: {titleLeft: 'Unit Overview'},
			startOnRightSide: true,
			color: colors.unitTitle,
		});		
		blocks.push({
			type: 'setStartPagingPage',
		});		
		
		blocks.push({
			type: 'contentsPush',
			title: 'Unit Overview', 
			level: 1, 
			color: colors.black
		});
		//
		await processObjectFieldsIntoBlocks(unit, [
			{title: '', field:'student_unit_storyboard', paragraphsToPull: 1, params: {
				//fontSize:11
			}},
		], blocks);		
		
		blocks.push({
			type: 'p',
			value:'',
		});
		blocks.push({
			type: 'p',
			value:'',
		});
		
		blocks.push({
			type: 'introductions',
			value:[
				{title: 'Challenge', field:'student_introduction_challenge_description'},
				{title: 'Science Methods', field:'student_introduction_science_methods_description'},
				{title: 'Culminating Experience', field:'student_introduction_culminating_experience_description'},
			],
			color: 'black',
			fontSize: 11,
			paddingBottom: 0.5,
			titleFont: fonts.bold,
			data: unit
		});
		
		blocks.push({
			type: 'h1',
			headerTitle: {titleLeft: 'Unit Roadmap'},
			startOnRightSide: false,
			color: colors.unitTitle,
		});	
		blocks.push({
			type: 'contentsPush',
			title: 'Unit Roadmap', 
			level: 1, 
			color: colors.black
		});
		
		const roadMapImg=allWorkShets.find(file=>file.fileTitle.indexOf('roadmap')>0 && file.type=='pdf');
		
			
		if (roadMapImg){
			const roadMapImgPath=await downloadFile(roadMapImg.path);
			const roadMapImgPaths=await convertPptxPdf(roadMapImgPath, roadMapImg);
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
					marginTop: 2
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
			type: 'h2',
			value:'Use this space to jot down notes and ideas for the Culminating Experience.',
			headerTitle: {
				leftTitle: '',	
			},
			fontSize:11
		});
		
		blocks.push({
			type: 'custom',
			drawFn: (doc)=>{
				//contentWidth;
				doc.lineJoin('round')
				   .roundedRect(textIdents.left, doc.y, PDFUtils.textWidth-10, 600, 10)
				   .stroke();
			},
		});
		
		
		blocks.push({
			type: 'sectionCover',
			sectionNum: 2,
			title: 'Phenomena Visuals',
			contentsTitle: 'Section 2: Phenomena Visuals',
			text: customPagesGlobal.Section2.content,
			textFontSize:11, 
			image: customPagesGlobal.Section2.image,
			color: colors.unitTitle,
		})	
		
		console.log(allWorkShets);
		let currLessonId;
		//console.log(customPages.phenomenon);
		const phenomenonFiles=allWorkShets.filter(file=>file.fileTitle.indexOf('phenomenon')>0 && file.type=='pdf');
		
		await asyncForEach(phenomenonFiles, async (file)=>{
			//const file=allWorkShets.find(file=>file.fileTitle.indexOf(item.file)===0);
			let contentsObj;
			//console.log(file);
			if (currLessonId!==file.lesson_id){
				const lesson=lessons.find(l=>l.lesson_id===file.lesson_id);
				if (lesson){
					contentsObj={
						title: 'Lesson '+lesson.number+' '+lesson.name+'', 
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
		blocks.push({
			type: 'sectionCover',
			sectionNum: 3,
			title: 'Activity Files',
			contentsTitle: 'Section 3: Activity Files',
			text: customPagesGlobal.Section3.content,
			color: colors.unitTitle,
		});
	
		
		await asyncForEach(allWorkShets.filter(file=>{
			const excludedEnds=['presentation','transcripts','exit-ticket','key'];
			return file.worksheet_language_id==1 
				&& (argv.firstExport || (!argv.firstExport && file.for_student))
				&& file.type==='pdf' 
				&& (!roadMapImg || (roadMapImg && file.id!==roadMapImg.id)) 
				&& !phenomenonFiles.find(f=>f.id===file.id)
				&& !excludedEnds.find(str=>file.fileNameWithExt.indexOf(str+'.')>0)
				&& !allWorkShets.find(f=>f.fileName===file.fileName && f.type==='pptx')
		}), async (file)=>{
			//const file=allWorkShets.find(file=>file.fileTitle.indexOf(fileName.trim())===0);
			let contentsObj;
			//console.log(file);
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
			//
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
					path: item.imagePath,
					heigth: getImgPropHeigth(imgInfo, width),
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
					leftBoxWidth: images[0].rotated ? 55 : 0,
					headerParams: {
						type: file.for_print ? 'nameClassDate' : '',
						topWhiteOverlayHeight: 55,
						lineY: 45
					} 
				});
			}
			
		});
		
		blocks.push({
			type: 'sectionCover',
			sectionNum: 4,
			title: 'End-of-Unit Study Guide',
			contentsTitle: 'Section 4: End-of-Unit Study Guide',
			text: customPagesGlobal.Section4.content,
			color: colors.unitTitle,
		});
		
		const renewFiles=unit.reviewWorkshet.filter(file=>file.type==='pdf');
		let part=0;
		await asyncForEach(renewFiles, async (file, index)=>{

			if (index<1 || index>5){
				return;
			}
			part++;
			
			if (!file){
				//return;
			}
			let contentsObj={
				title: file.title, 
				level: 1, 
				color: colors.black
			};

			const path=await downloadFile(file.path);
			const imgPaths=await convertPptxPdf(path, file);
			//const imgPaths=await convertPdf(path);
			console.log(imgPaths);
			let x=0;
			const images=[]; 
			const width=465;

			await asyncForEach(imgPaths, async (item)=>{
				const imgInfo=await imageInfo(item.imagePath);
				images.push({
					path: item.imagePath,
					heigth: getImgPropHeigth(imgInfo, width),
					rotated: imgInfo.rotated,
					width,
					x
				})
				x+=width;
				if (x>390){
					x=textIdents.left;
				}
			});	
			/*
			blocks.push({
				type: 'h1',
				headerTitle: {titleLeft: 'Part 5: Unit Vocabulary', hideLine:true, showThoughtStartIcon: false},
				startOnRightSide: false,
				color: colors.unitTitle,
			});
			*/
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
			/*
			images.forEach(image=>{
				blocks.push({
					type: 'h1',
					headerTitle: {titleLeft: file.title, hideLine:true, showThoughtStartIcon: false},
					startOnRightSide: false,
					color: colors.unitTitle,
				});
				if (contentsObj){
					blocks.push({
						type: 'contentsPush',
						...contentsObj
					})
				}				
				blocks.push({
					type: 'image',
					value: image.path,
					width: contentWidth,
					align: 'center'
				});
			});	
			*/		
		});
		
		blocks.push({
			type: 'sectionCover',
			sectionNum: 5,
			title: 'Additional Resources',
			contentsTitle: 'Section 5: Additional Resources',
			text: customPagesGlobal.Section5.content,
			color: colors.unitTitle,
		});
		
		if (unit.vocab.length){
			
			blocks.push({
				type: 'h1',
				headerTitle: {titleLeft: 'Unit Vocabulary'},
				startOnRightSide: false,
				//fontSize: 11,
				color: colors.unitTitle,
			});		
			blocks.push({
				type: 'contentsPush',
				title: 'Unit Vocabulary', 
				level: 1, 
				color: colors.black,
			});	
			
			let vocabHtml='';
			unit.vocab.forEach(item=>{
				vocabHtml+='<p><strong>'+item.word+'</strong> - '+item.definition+'</p>';
			})				
			await asyncForEach(parse(vocabHtml).childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el, {
					ident: 0,
					moveDown: 0.4
					//fontSize: 11,
				}, blocks);
			});
		}
		
		const addPages=customPagesGlobal.AdditionalResources;
		const addPagesTitles=['Science and Engineering Practices', 'Crosscutting Concepts'];
		await asyncForEach(addPages['SEP-CCC-Images'], async (img, index)=>{
			console.log(img);
			const title=addPagesTitles[index];
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
				x:40,
				y:90
			});	
			await processObjectFieldsIntoBlocks(addPages, [
				{title: '', field:'text'+(index+1), 
					params: {
					
					}
				},			
			], blocks);	
			
		});
		
		
	}
	
	console.log('Preparing content blocks...');
	await generateBlocks();
	console.log('Created '+blocks.length+' blocks');
	
	console.log('Generating temp PDF file...');
	PDFUtils.generatePdf('temp.pdf', blocks);
	
	const pdfFileName=argv.destPath || 'Workbook '+model.display_name+' Unit '+unit.number+'.pdf';
	console.log('Generating publication PDF '+pdfFileName+'...');
	PDFUtils.generatePdf(pdfFileName, blocks);
}
main().then(res=>{
	console.log('done');
}).catch(err=>{
	console.log('Error');
	console.log(err);
})