/*
	Workshet preview generate requires graphicsmagick binary installed in the system
	Mac Os installation: `brew install graphicsmagick`
*/

async function main() {
	const mysql = require('mysql2');
	const bluebird = require('bluebird');
	const PDFDocument = require('pdfkit');
	const PdfTable = require('./lib/voilab-table');
	const parse = require('node-html-parser').parse;
	const fs = require('fs');
	const http = require('https');
	const _ = require('lodash');
	const Jimp = require('jimp');
	
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
	} = require('./lib/utils');
	const { materialsQtySet } = require('./lib/greenninja');
	
	//config.db.Promise=bluebird;

	
	const colors={
		unitTitle: '#02727D',
		green: '#6FAC44',
		lessonGreen: '#1E793C',
		brown: '#634439',
		black: 'black',
		blue: '#25408F'
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
	}
	
	const headerTitles=[
		{titleLeft: 'Unit 1:', titleRight: 'Unit Overview', icon: 'images/icons/blue_overview.jpg'},
		{titleLeft: 'Unit 1:', titleRight: 'Materials', icon: 'images/icons/TeachingResources_blue.jpg'},
	];
	
	let currentTitle;
	let contentsPage;
	
	const cleanUpHTML=(html) => {
		let res=(html || '')
			.replace(/(<a([^>]+)>)/ig, "")
			.replace(/(<\/a>)/ig, "")
			.replace(new RegExp('<\s*span style="font-weight: 400;"[^>]*>(.*?)<\s*/\s*span>', 'ig'), (match, str)=>{
				console.log('regexp', match, str);
				return str;
			})
			;
		//console.log(res);
		if (res.indexOf('<')<0){
			res='<p>'+res+'</p>';
		}
	  	return res;

	}
	
	
	
	console.log('Connected to the DB');
	
	const modelId=11;
	const unitId=17;
	
	console.log('Loading data...');
	const unit=(await dbQuery([
		'SELECT * FROM `unit` t',
		'WHERE t.`unit_id` = ?'
	], [unitId]))[0];
	
	const model=(await dbQuery([
		'SELECT * FROM `model` t',
		'WHERE t.`model_id` = ?'
	], [modelId]))[0];
	
	let lessons=await dbQuery([
		'SELECT * FROM `lesson` t',
		'INNER JOIN `unit_lesson_mapping` m',
		'ON t.`lesson_id`=m.`lesson_id` AND m.`unit_id` = ?',
	], [unitId]);
	
	await asyncForEach(lessons, async (lesson)=>{
		lesson.pe=await dbQuery([
			'SELECT pe.title, lpm.progressions, pe.pe_id',
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
		lesson.ccl=await dbQuery([
			'SELECT *',
			'FROM lesson_ccl_mapping_new m',
			'JOIN CCL_NEW t ON m.ccl_id = t.id',
			'WHERE m.lesson_id = ?'
		], [lesson.lesson_id]);
		lesson.ccm=_.sortBy(lesson.ccm, item=>item.priority);
		lesson.ccl=_.sortBy(lesson.ccl, item=>item.priority);
		lesson.worksheet=await dbQuery([
			'SELECT *',
			'FROM lesson_worksheet_mapping m',
			'JOIN worksheet t ON m.worksheet_id = t.worksheet_id',
			'WHERE m.lesson_id = ? AND t.type NOT IN ("docx", "doc")'
		], [lesson.lesson_id]);
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
	});
	
	const unitLessonIds=unit.lessons.split(',');
	
	lessons.forEach(lesson=>{
		lesson.index=unitLessonIds.indexOf(lesson.old_lesson_id);
		lesson.number='1.'+(lesson.index+1);
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
		});
		lesson.worksheet=_.sortBy(lesson.worksheet, file=>file.fileName);
		lesson.activityPlan.forEach(item=>{
			item.files=[];
			item.content=item.content.replace(new RegExp('\(\{\{'+lesson.old_lesson_id+'\}\}([a-z\-\.]+)\)', 'igm'), (match, str, str1, str2)=>{
				//console.log(item.content);
				console.log('regexp', match, str, str1);
				const workshet=lesson.worksheet.find(file=>file.fileNameWithExt===str1);
				if (workshet){
					item.files.push(workshet);
					return workshet.fileTitle;
				}
				return str;
			});
			//console.log(item.content);
		})
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
	
	/*
		"materialsListUnitOverview": results,
		"materialLsKit": materialLsKit,
		"materialLsTeacher": materialLsTeacher,
		"materialLsOptional": materialLsOptional,
		"materialLessonMapping": reducedLessonMaterialMapping,
	*/
	
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
			const notes=item.notes.map(n=>'1.'+n.lesson_sequence + ' - '+ n.note).join(', ');
			const alternative=item.alternative.map(n=>'1.'+n.lesson_sequence + ' - '+ n.alternative).join(', ');
			console.log(item);
			
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
	//return;
	
	//materials=_.sortBy(materials, m=>m.name);
	
	console.log('Loaded Unit "'+unit.name+'" and '+lessons.length+' lessons');
	await closeDbConnection();
	//console.log(materials);
	//return;
	
	//console.log(JSON.stringify(unit, null, 4));
	//console.log(lessons);
	//return;
	//console.log((await db.query('SELECT * FROM `lesson` t WHERE t.`lesson_id` = ?', [2]))[0]);
	
	const convertHtml=(text)=>{
		const unitLessonIds=unit.lessons.split(',')
		return decodeHtml(text).replace(/\{\{([^\s]+)\}\}/g, (match, id)=>{
			console.log(match, id);
			const item=lessons.find(l=>l.old_lesson_id===id);
			if (item){
				return 'Lesson '+item.number+' '+item.name;
			}
			return '';
		});
	}
	
	const doc = new PDFDocument({
  		bufferPages: true,
  		autoFirstPage: false 
  	});
	let pageNum=0;
 
	doc.pipe(fs.createWriteStream('output.pdf'));
	
	const writeHeader=(doc)=>{
		if (!currentTitle){
			return;
		}
		doc.x=60;
		
		doc
		  .moveTo(60, 30)
		  .font(fonts.semiBold)
		  .fontSize(16)
		  .text(currentTitle.titleLeft, 60, 30);
	  
		doc
		  .font(fonts.semiBold)
		  .fontSize(16)
		  .text(currentTitle.titleRight, 70, 30, {
		  	width: 410,
		  	align: 'right'
		  });
	  
	
		doc
		.image(currentTitle.icon, 490, 15, {
		  width: 43,
		  align: 'center',
		  valign: 'center'
		});
		
		//doc.text(pageNum, textIdents.left, 600) 
	  
		doc
		  .save()
		  .moveTo(55, 65)
		  //.lineTo(50, 40)
		  .lineTo(550, 65)
		  .lineTo(550, 68)
		  .lineTo(55, 68)
		  .fill(currentTitle.color || colors.unitTitle);
		
		
		
	}
	
	const addNewPage=(doc)=>{
		
		doc
			.font(fonts.regular)
			.lineGap(4)
			.fontSize(10)
			.fill('black')
			.text(' ', {
				width: 465,
				continued: false
			});
	   	writeHeader(doc);
	   	doc
			.font(fonts.regular)
			.lineGap(4)
			.fontSize(10)
			.fill('black')
			.text(' ', {
				width: 465,
				continued: false
			});
		
	   	doc.x=textIdents.left;
	   	doc.moveDown(0.3);
	}
	
	doc.on('pageAdded', () => {
		pageNum++;
		addNewPage(doc);
	});
	const blocks=[];
	const contents=[];
	
	const addH2=(doc, text, rightText)=>{
		const y=doc.y;
		doc
		  .font(fonts.bold)
		  .fontSize(13.5)
		  .fill('black')
		  .text(text, textIdents.left);
		  
		if (rightText){
			doc
			  .font(fonts.bold)
			  .fontSize(13.5)
			  .text(rightText, 70, y, {
				width: 460,
				align: 'right'
			  });
		}
		
		//doc.moveDown(0.1);
	}
	
	const parseHTMLIntoBlocks=async(text)=>{
		let textNodes=[];
		if (text.tagName==='p' || 1){
			await asyncForEach(text.childNodes, async(node)=>{
				if (node.tagName!=='img'){
					textNodes.push(node);
				}
				else {
					let path=await downloadFile(node.getAttribute('src'));
					//path=await convertImage(path, 'jpeg');
					const imgInfo=await imageInfo(path);
				
					if (textNodes.length){
						blocks.push({
							type: 'p',
							value: textNodes,
							isHtml: true,
						});
						textNodes=[];
					}
				
				
					blocks.push({
						type: 'image',
						value: path,
						heigth: getImgPropHeigth(imgInfo, 465)
					});
				
				}
			})
		}
		
		/*
		if (node.tagName==='ul'){
			await asyncForEach(text.childNodes, async(node)=>{
				blocks.push({
					type: 'list',
					value: node,
					isHtml: true,
				});
			})
		}
		*/
		
		if (textNodes.length){
			blocks.push({
				type: 'p',
				value: textNodes,
				isHtml: true,
			});
			textNodes=[];
		}
	}
	const processObjectFieldsIntoBlocks=async(object, fields)=>{
		return await asyncForEach(fields, async(item)=>{
			if (!object[item.field] || !object[item.field].trim()){
				return;
			}
		
			if (item.title){
				blocks.push(_.extend(item.params || {}, {
					type: item.headerType || 'h2',
					value: item.title,
					rightText: item.titleRight
				}))
			}
		
			const root=parse(cleanUpHTML(object[item.field]));

			await asyncForEach(root.childNodes, async (el)=>{
				await parseHTMLIntoBlocks(el);
			});
			if (item.breakAfter){
				blocks.push({
					type: 'pageBreak'
				})
			}
			if (item.lineAfter){
				blocks.push({
					type: 'line'
				})
			}
		});
	}
	const drawActions={
		pageBreak: (doc, item)=>{
			if (item.headerTitle){
				currentTitle=item.headerTitle;
			}
			doc.addPage();
		},
		h1: (doc, item)=>{
	  		currentTitle=item.headerTitle || headerTitles.find(t=>t.titleRight===item.value);
			doc.addPage();
			doc
			  .font(fonts.regular)
			  .fontSize(17)
			  .fill('black')
			  .text(item.value, textIdents.left, textIdents.top);
			doc.moveDown(item.paddingBottom || 0.5);
			if (item.addContents){
					drawActions.contentsPush(doc, {title:item.value, level:1, color:colors.black});
			}
		},
		h2: (doc, item)=>{
			if (item.headerTitle){
				currentTitle=item.headerTitle;
				doc.addPage();
			}
			
			if (doc.y>660){
				doc.addPage();
			}
			if (doc.y>200){
				doc.moveDown(1);
			}
			addH2(doc, item.value, item.rightText);
			doc.moveDown(0.2);
			doc
				.font(fonts.regular)
				.fontSize(10)
			  	.fill('black')
		},
		h3: (doc, item)=>{
			doc
			  .font(fonts.bold)
			  .fontSize(10)
			  .fill('black')
			  .text(item.value, textIdents.left);
			doc.moveDown(0.2);
			doc
				.font(fonts.regular)
				.fontSize(10)
			  	.fill('black')
		},
		lessonPlanHeader: (doc, {value, rightText, headerTitle})=>{
			if (headerTitle){
				currentTitle=headerTitle;
				doc.addPage();
			}
			
			if (doc.y>660){
				doc.addPage();
			}
			if (doc.y>200){
				doc.moveDown(1);
			}
			
			const y=doc.y;
			doc
			  .font(fonts.semiBold)
			  .fontSize(14)
			  .fill('black')
			  .text(value, textIdents.left);
			
			doc
			  .font(fonts.semiBold)
			  .fontSize(14)
			  .text(rightText, 70, y, {
				width: 460,
				align: 'right'
			  });
			  
			doc.moveDown(0.2);
			doc
				.font(fonts.regular)
				.fontSize(10)
			  	.fill('black')
		},
		p: (doc, item)=>{
			if (item.isHtml){
				const tagFonts={
					em: fonts.italic,
					b: fonts.bold,
					strong: fonts.bold,
				}
				const tagFeatures={
					sup: ['sups'] 
				}
				item.value.forEach(node=>{
					if (node.tagName ==='li'){
						const listText=convertHtml(node.text).replace(/\n/g, '').trim();
						const lists=[];
						//console.log('str:', node.childNodes, node.childNodes.map(node=>node.tagName));
						if (!node.querySelector('ul')){
							lists.push(convertHtml(node.text).replace(/\n/g, '').trim());
						}
						else {
							node.childNodes.forEach(node=>{
								//console.log('str inner:', node.childNodes.map(node=>node.tagName));
								if (!node.childNodes.filter(node=>node.tagName==='li').length){
								//if (node.childNodes.length<2){
									const text=convertHtml(node.text).replace(/\n/g, '').trim();
									if (text){
										lists.push(text);
									}
									//console.log('text: ', text);
								
								}
								else {
									const texts=node.childNodes.map(n=>convertHtml(n.text).replace(/\n/g, '').trim());
									if (texts.length){
										lists.push(texts.filter(t=>t));
									}
								
								}	
							})
						}
						
						//console.log(lists);
						doc.fillColor('black')
							.font(tagFonts[node.tagName] || fonts.regular)
							.list(lists, {
								bulletIndent: 50,
								//textIndent: 20,
								bulletRadius:3,
							});	
								
					}
					else {
						//console.log(node);
						const styles={};
						(node.getAttribute && node.getAttribute('style') ? node.getAttribute('style').split(';') : []).map(item=>{
							const arr=item.split(':');
							if (arr && arr.length>1){
								styles[arr[0].trim()]=arr[1].trim();
							}
						});
						//console.log('styles', styles);
						if (node.childNodes && node.childNodes[0] && node.childNodes[0].tagName==='strong'){
							node.tagName='strong';
						}
						if (node.tagName==='br'){
							//doc.moveDown(0.2);
							doc.text(' ', textIdents.left, doc.y, {
								width: 465,
								continued: false
						   });
						}
						doc.fillColor(styles.color || 'black')
							.font(tagFonts[node.tagName] || fonts.regular)
							.lineGap(1.2)
							.fontSize(10)
					   .text(convertHtml(node.text)/*.trimStart()*/, textIdents.left, doc.y, {
							width: 465,
							continued: true,
							lineBreak: true,
							align: 'left',
							features: tagFeatures[node.tagName] || [],
					   });
					   //console.log(node.tagName, tagFeatures[node.tagName]);
					}
					
				});
			}
			else {
				doc.fillColor('black')
					.font(fonts.regular)
					.lineGap(1.6)
					.fontSize(10)
			   .text(item.value, textIdents.left+(item.ident || 0), doc.y,{
					width: 465,
					continued: true
			   });
			}
		
		   doc.text(' ', {
				width: 465,
				continued: false
		   });
		   doc.moveDown(0.2);
		},
		image:(doc, item)=>{
			if (doc.y+item.heigth>840){
				doc.addPage();
			}
			else {
				doc.moveDown(0.5);
			}
			//console.log(doc.x, doc.y);
			console.log(item);
			doc.image(item.value, {width: item.width || 465});
			doc.moveDown(0.5);
		},
		images:(doc, item)=>{
			if (doc.y+item.value[0].heigth>740){
				doc.addPage();
			}
			let y=doc.y;
			item.value.forEach(image=>{
				if (doc.y+image.heigth>840 && image.x===textIdents.left){
					doc.addPage();
				}
				else if (!image.x || image.x===textIdents.left) {
					doc.moveDown(0.5);
					y=doc.y;
				}
				if (image.x && image.x > textIdents.left){
					doc.y=y;
				}
				doc.x=image.x;				
				doc.image(image.path, {width: image.width || 465});
			})
			//console.log(doc.x, doc.y);
			console.log(item);
			doc.moveDown(0.5);
		},
		table: (doc, {columns, data, fontSize, hideHeaders, borderColor})=>{
			//console.log({columns, data});
			table = new PdfTable(doc, {
                bottomMargin: 10,
                showHeaders: !hideHeaders
            });
            
            doc
				.font(fonts.regular)
				.fontSize(fontSize || 8)
				.lineGap(1)
			  	.fill('black')
 
			table
				// add some plugins (here, a 'fit-to-width' for a column)
				// set defaults to your columns
				.setColumnsDefaults({
					headerBorder: 'B',
					align: 'left',
					border: 'LTBR',
					headerBorder: 'LTBR',
					borderOpacity: 1,
					borderColor: borderColor || '#999',
					headerBorderOpacity: 1,
					headerPadding: [4,4,4,4],
					padding: [4,4,4,4],
					/*
					headerRenderer: function (tb, data) {
						doc.font(fonts.bold)
						console.log(tb, data);
                        return 'CHF ' + data.total;
                    }*/
				})
				// add table columns
				.addColumns(columns)
				// add events (here, we draw headers on each new page)
				.onPageAdded(function (tb) {
					tb.addHeader();
				})
				.onHeaderAdd(tb=>{
					tb.pdf.font(fonts.bold)
				})
				.onHeaderAdded(tb=>{
					tb.pdf.font(fonts.regular)
				})
			table.addBody(data);
			
			doc.text(' ', textIdents.left, doc.y, {
				width: 465,
				continued: false
		   	});
		   	doc.moveDown(0.2);
		},
		sectionCover: (doc, {title, image, color, addContents})=>{
			currentTitle=null;
			doc.addPage();
			
			doc.x=60;
		
			doc
			  .font(fonts.semiBold)
			  .fontSize(36)
			  .text(title, textIdents.left, 80, {
				width: 465,
				align: 'center'
			  });
	  	
	  		doc
			  .save()
			  .moveTo(120, 150)
			  //.lineTo(50, 40)
			  .lineTo(480, 150)
			  .lineTo(480, 153)
			  .lineTo(120, 153)
			  .fill(color);
			
			doc
			.image(image, 50, 220, {
			  width: 500,
			  align: 'center',
			  valign: 'center'
			});
			
			if (addContents){
				drawActions.contentsPush(doc, {title, level:0, color});
			}
		},
		list: (doc, {value, ident})=>{
		
			doc.fillColor('black')
				.font(fonts.regular)
				.list(value, textIdents.left+(ident || 0), doc.y, {
					bulletIndent: 50,
					//textIndent: 20,
					bulletRadius:3,
				});	
				
			doc.text(' ', textIdents.left, doc.y, {
				width: 465,
				continued: false
		   });
		},
		line: (doc) => {
			doc.moveDown(0.2);
			doc.lineWidth(1)
				.strokeColor('#999')
			   .moveTo(55, doc.y)
			   .lineTo(550, doc.y)
			   .stroke();
			doc.moveDown(0.2);
		},
		pptSlide: (doc, {value, imgInfo}) =>{
		
			const width=170;
			const heigth=getImgPropHeigth(imgInfo, width);
			if (doc.y+(heigth+30)>750){
				doc.addPage();
			}
			else {
				doc.moveDown(0.5);
			}
			
			doc.fillColor('black')
				.font(fonts.bold)
				.lineGap(1.6)
				.fontSize(10)
		   	.text('Slide '+value.slideNum, {
				width: 465,
				continued: false
		   	});
		   	
		   	const y=doc.y;
			doc.image(value.imagePath, {width: width});
			const yAfterImage=doc.y;
			
			doc.fillColor('black')
				.font(fonts.regular)
				.lineGap(0.6)
				.fontSize(10)
		   	.text(value.text ? 'Notes \n \n'+value.text : '', textIdents.left+width+15, y,{
				width: 465-(width+15),
				continued: false
		   	});
		   	doc.x=textIdents.left;
		   	doc.y=yAfterImage > doc.y ? yAfterImage : doc.y 
		   	
			doc.moveDown(0.5);
		},
		introductions: (doc, {value, imgInfo}) =>{
			value.forEach(item=>{
				doc.fillColor(colors.green)
					.font(fonts.regular)
					.lineGap(4)
					.fontSize(10)
				   .text(item.title+': ', {
					 width: 465,
					 continued: true
				   }).fillColor('black')
				   .text(unit[item.field]);
			});
			doc.moveDown(1);
		},
		contentsPush: (doc, {title, level, color})=>{
			contents.push({title, level, color, pageNum});
			//console.log(doc.page);
		},
		contents: (doc)=>{
			if (!contents.length){
				doc.addPage();
				contentsPage=pageNum;
				return;
			}
			doc
			  .font(fonts.bold)
			  .fontSize(24)
			  .text('Table of Contents', textIdents.left, 40, {
				width: 465,
				align: 'left',
				continued: false
			  });
			drawActions.line(doc);
			
			doc.moveDown(0.2);
			
			contents.forEach(item=>{
				const y=doc.y;
				let lineStart;
				const lineY=doc.y+11;
				if (item.level===0){
					doc
					  .font(fonts.bold)
					  .fontSize(12)
					  .fillColor(item.color || 'black')
					  .text(item.title, textIdents.left, y, {
						align: 'left'
					  });
					lineStart=doc.x+(item.title.length*6)+8;
					doc
					  .font(fonts.bold)
					  .fontSize(12)
					  .text(item.pageNum, 70, y, {
						width: 460,
						align: 'right'
					  });
					  
					doc.lineWidth(1.5)
						.strokeColor(item.color)
					   	.moveTo(lineStart, lineY)
					   	.lineTo(520-((item.pageNum+'').length*6), lineY)
					   	.dash(2, {space: 2})
					   	.stroke();
				}
				if (item.level===1){
					doc
					  .font(fonts.regular)
					  .fontSize(10)
					  .fillColor(item.color || 'black')
					  .text(item.title, textIdents.left+20, y, {
						width: 465,
						align: 'left'
					  });
					lineStart=doc.x+(item.title.length*5)+5;
					doc
					  .font(fonts.regular)
					  .fontSize(10)
					  .text(item.pageNum, 70, y, {
						width: 460,
						align: 'right'
					  });
					  
					doc.lineWidth(1)
						.strokeColor(item.color || 'black')
					   	.moveTo(lineStart, lineY-2)
					   	.lineTo(520-((item.pageNum+'').length*6), lineY-2)
					   	.dash(2, {space: 2})
					   	.stroke();
				}

			   //doc.moveDown(0.1);
			})
			//console.log(doc.page);
		}
	}
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
		value:'Unit Overview',
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
			{title: 'Phenomena', field:'introduction_phenomena_description'},
			{title: 'Science Methods', field:'introduction_science_methods_description'},
			{title: 'Culminating Experience', field:'introduction_culminating_experience_description'},
		],
	});
	
	
	await processObjectFieldsIntoBlocks(unit, [
		{title: 'Unit Storyline', field:'student_unit_storyboard'},
		{title: 'Unit Roadmap', field:'unit_roadmap'},
		{title: 'Science Background', field:'background_description'},
		{title: 'Science in Action', field:'science_in_action_description', breakAfter: true},
		{title: 'Green Ninja Connections', field: 'connections_description', breakAfter: true},
		{title: 'Home to School Connections', field: 'home_to_school'},
		{title: 'Prior Knowledge', field: 'prior_knowledge', breakAfter: true},
		{title: 'Assessment', field: 'assessment'},
		{title: 'Identifying Preconceptions', field: 'identifying_preconceptions'},
		{title: 'Access and Equity', field: 'access_and_equity', breakAfter: true},
		{title: 'Engineering Connections', field: 'eng_connections'},
		{title: 'Resources'},
		{title: 'Outside Educational Resources', field: 'outside_resources', headerType: 'h3'},
		{title: 'Supplemental Resources', field: 'supplemental_resources', headerType: 'h3'},
		{title: 'Technology and Teaching', field: 'tech_teaching'},
	]);
	
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
	]);
	
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
	}].forEach(mat=>{
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

	await parseHTMLIntoBlocks(tableDescr);
	console.log(tableDescr);	
	
	blocks.push({
		type: 'sectionCover',
		title: 'Lesson Guides',
		image: 'images/lesson-guides.jpg',
		color: colors.lessonGreen,
		addContents: true,
	});

	
	await asyncForEach(lessons/*.filter(l=>l.number==='1.6')*/, async (lesson)=>{
		//await parseHTMLIntoBlocks(el);
		let header={
			titleLeft: 'Lesson Introduction', 
			titleRight: 'Lesson '+lesson.number, 
			icon: 'images/icons/Lesson_green.jpg',
			color: colors.lessonGreen
		};
		blocks.push({
			type: 'h1',
			value: 'Lesson '+lesson.number+' '+lesson.name,
			headerTitle: header,
			paddingBottom: 0.1,
			addContents: true
		});
		
		await processObjectFieldsIntoBlocks(lesson, [
			{title: '', field:'description'},
			{title: 'Phenomenon', field:'phenomenon'},
			{title: 'Learning Objectives', field:'objectives'},
		]);
		
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
				await parseHTMLIntoBlocks(el);
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
		]);
		
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
		
		blocks.push({
			type: 'h2',
			value: 'Materials',
			headerTitle: {
				titleLeft: 'Lesson Prep', 
				titleRight: 'Lesson '+lesson.number, 
				icon: 'images/icons/Lesson_green.jpg',
				color: colors.lessonGreen
			},
			paddingBottom: 0.1
		});
		
		/*
		if (lesson.materials.filter(item=>(item.plural_name || item.name)).length){
			blocks.push({
				type: 'h2',
				value: 'Materials'
			});
		}
		*/
		
		['For the teacher', 'For each student', 'For each group of 4 students'].forEach((title, forWhomInd)=>{
			const materials=lesson.materials.filter(item=>(item.plural_name || item.name) && item.forWhomInd===forWhomInd);
			if (materials.length){
				blocks.push({
					type: 'h3',
					value: title,
				});
			
				blocks.push({
					type: 'list',
					value: materials.map(item=>{
						return parseFloat(item.quantity)+' - '+item.name.replace('\n', ' ');
					}),
					ident: 20,
				});
			}
		})
		
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
					},
					{
						id: 'page',
						header: '',
						width: 155,
					},
				],
				data: lesson.worksheet
			})
			
		}
		
		await processObjectFieldsIntoBlocks(lesson, [
			{title: 'Teacher Prep', field:'teacher_prep'},
		]);
		
		
		blocks.push({
			type: 'h2',
			value: '',
			headerTitle: {
				titleLeft: 'Lesson Plan', 
				titleRight: 'Lesson '+lesson.number, 
				icon: 'images/icons/Lesson_green.jpg',
				color: colors.lessonGreen
			},
			paddingBottom: 0.0
		});
		
		
		await asyncForEach(lesson.activityPlan, async (plan)=>{
			await processObjectFieldsIntoBlocks(plan, [
				{
					title: plan.header.trim(), 
					field:'content', 
					titleRight: '~ '+plan.time, 
					headerType: 'lessonPlanHeader',
					params: {
						resetCurentH2: true
					}
				},
			]);
			await asyncForEach(plan.files, async (file)=>{
				const path=await downloadFile(file.path);
				if (file.type==='pdf'){
					const imgPaths=await convertPdf(path);
					console.log(imgPaths);
					let x=textIdents.left;
					const images=[];
					const width=imgPaths.length > 1 ? 232 : 400;
					await asyncForEach(imgPaths, async (imgPath)=>{
						const imgInfo=await imageInfo(imgPath);
						images.push({
							path: imgPath,
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
					const pptData=await convertPptx(path, file);
					console.log(pptData);
					await asyncForEach(pptData, async (item)=>{
						const imgInfo=await imageInfo(item.imagePath);
						blocks.push({
							type: 'pptSlide',
							value: item,
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
		
		blocks.push({
			type: 'pageBreak',
		});
		
		await processObjectFieldsIntoBlocks(lesson, [
			{title: 'Teacher Tips', field:'anticipated_challenges'},
		]);
		
		if (lesson.vocab && lesson.vocab.length){
			blocks.push({
				type: 'h2',
				value: 'Vocabulary',
			});
		
			blocks.push({
				type: 'list',
				value: lesson.vocab.map(item=>{
					return item.word+' - '+item.definition;
				}),
				ident: 20,
			});
		}
		
		await processObjectFieldsIntoBlocks(lesson, [
			{title: 'Tying It All Together', field:'all_together'},
			{title: 'Content Knowledge', field:'background'},
		]);
		
		
		
		
		if (lesson.number==='1.6'){
			console.log(lesson.activityPlan);
		}
		
	});
	
	blocks.push({
		type: 'sectionCover',
		title: 'Lesson Files',
		image: 'images/lesson-files.jpg',
		color: colors.brown,
		addContents: true,
	})
	
	
	
	let currentH2;
	blocks.forEach((item, i)=>{
		if (item.type=='h2'){
			currentH2=item;
		}
		if (item.resetCurentH2){
			currentH2=null;
		}
		if (item.type=='p' && blocks[i+1] && blocks[i+1].type==='image' && !blocks[i+1].dontAttachParagraphToImage && (doc.y+blocks[i+1].heigth)>740){
			doc.addPage();
			if (currentH2){
				drawActions[currentH2.type](doc, currentH2);
			}
		}
		if (item.type=='image' && (doc.y+item.heigth)>740){
			doc.addPage();
		}
		if (item.type=='h2' && blocks[i+1] && blocks[i+1].type==='image' && (doc.y+blocks[i+1].heigth)>740){
			doc.addPage();
		}
		if (item.type=='p' && item.isTitle && blocks[i+1] && blocks[i+1].type==='list' && doc.y>670){
			doc.addPage();
		}
		drawActions[item.type](doc, item);
	});
	console.log(contents);
	
	//adding page numbers
	const range = doc.bufferedPageRange(); // => { start: 0, count: 2 }
	for (i = range.start, end = range.start + range.count, range.start <= end; i < end; i++) {
	  doc.switchToPage(i);
	  //doc.text(`Page ${i + 1} of ${range.count}`);
	  doc.page.margins.bottom=0;
	  doc
		.font(fonts.regular)
		.fontSize(9)
		.fill('black')
		.text(i+1, textIdents.left, 750, {
			width: 465,
			continued: false,
			align: 'center'
		});
	}
	if (contentsPage && contents.length){
		doc.switchToPage(contentsPage-1);
		drawActions.contents(doc);
	}
	
	doc.end();
	
}
main().then(res=>{
	console.log(res);
}).catch(err=>{
	console.log('Error');
	console.log(err);
})