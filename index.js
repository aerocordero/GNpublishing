async function main() {
	const mysql = require('mysql2');
	const bluebird = require('bluebird');
	const PDFDocument = require('pdfkit');
	const PdfTable = require('voilab-pdf-table');
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
	} = require('./lib/utils');
	
	//config.db.Promise=bluebird;

	
	const colors={
		unitTitle: '#02727D',
		green: '#6FAC44'
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
	
	const cleanUpHTML=(html) => {
		const res=(html || '')
			.replace(/(<a([^>]+)>)/ig, "")
			.replace(/(<\/a>)/ig, "")
			.replace(new RegExp('<\s*span style="font-weight: 400;"[^>]*>(.*?)<\s*/\s*span>', 'ig'), (match, str)=>{
				console.log('regexp', match, str);
				return str;
			})
			;
		//console.log(res);
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
	
	const lessons=await dbQuery([
		'SELECT * FROM `lesson` t',
		'INNER JOIN `unit_lesson_mapping` m',
		'ON t.`lesson_id`=m.`lesson_id` AND m.`unit_id` = ?'
	], [unitId]);
	
	const unitLessonIds=unit.lessons.split(',');
	
	lessons.forEach(lesson=>{
		lesson.number='1.'+(unitLessonIds.indexOf(lesson.old_lesson_id)+1);
	})
	
	const materialData=await dbQuery([
		'SELECT * FROM `materials` t',
		'INNER JOIN `lesson_materials_mapping` m',
		'ON t.`material_id`=m.`material_id` AND m.`lesson_id` IN ('+lessons.map(l=>l.lesson_id).join(',')+')',
		'ORDER BY t.name ASC'
	], []);
	let materials=_.values(_.groupBy(materialData, m=>m.material_id)).map(items=>{	
		const item=items[0];
		let quantity=0;
		
		items.forEach(item=>{
			quantity+=(parseFloat(item.quantity) || 0);
			item.lesson=lessons.find(l=>l.lesson_id==item.lesson_id);
		});
		return {
			name: item.plural_name || item.name,
			quantity,
			lessons: _.sortBy(items.map(item=>{
				return item.lesson.number;
			}), number=>parseFloat(number)).join(', '),
			alternative: items.filter(item=>item.alternative).map(item=>{
				return item.lesson.number + ' - '+ item.alternative;
			}).join(', '),
			notes: items.filter(item=>item.notes).map(item=>{
				return item.lesson.number + ' - '+ item.notes;
			}).join(', '),
			optionalInd: item.optionalInd
		}
	});
	materials=_.sortBy(materials, m=>m.name);
	
	console.log('Loaded Unit "'+unit.name+'" and '+lessons.length+' lessons');
	console.log(materials);
	
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
	let pageNum=1;
 
	doc.pipe(fs.createWriteStream('output.pdf'));
	
	const writeHeader=(doc)=>{
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
		  .fill(colors.unitTitle);
		
		
		
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
		addNewPage(doc);
	});
	const blocks=[];
	
	const addH2=(doc, text)=>{
		doc
		  .font(fonts.bold)
		  .fontSize(13.5)
		  .fill('black')
		  .text(text, textIdents.left);
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
	
	const drawActions={
		pageBreak: (doc, item)=>{
			doc.addPage();
		},
		h1: (doc, item)=>{
	  		currentTitle=headerTitles.find(t=>t.titleRight===item.value);
			doc.addPage();
			doc
			  .font(fonts.regular)
			  .fontSize(17)
			  .fill('black')
			  .text(item.value, textIdents.left, textIdents.top);
			doc.moveDown(0.5);
		},
		h2: (doc, item)=>{
			if (doc.y>660){
				doc.addPage();
			}
			if (doc.y>200){
				doc.moveDown(1);
			}
			addH2(doc, item.value);
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
		p: (doc, item)=>{
			if (item.isHtml){
				const tagFonts={
					em: fonts.italic,
					b: fonts.bold,
					strong: fonts.bold,
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
						doc.fillColor(styles.color || 'black')
							.font(tagFonts[node.tagName] || fonts.regular)
							.lineGap(1.2)
							.fontSize(10)
					   .text(convertHtml(node.text)/*.trimStart()*/, {
							width: 465,
							continued: true,
							lineBreak: true,
							align: 'left'
					   });
					}
					
				});
			}
			else {
				doc.fillColor('black')
					.font(fonts.regular)
					.lineGap(1.6)
					.fontSize(10)
			   .text(item.value, {
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
			console.log(doc.x, doc.y);
			doc.image(item.value, {width: 465});
			doc.moveDown(0.5);
		},
		table: (doc, {columns, data})=>{
			console.log({columns, data});
			table = new PdfTable(doc, {
                bottomMargin: 10
            });
            
            doc
				.font(fonts.regular)
				.fontSize(8)
			  	.fill('black')
 
			table
				// add some plugins (here, a 'fit-to-width' for a column)
				.addPlugin(new (require('voilab-pdf-table/plugins/fitcolumn'))({
					column: 'description'
				}))
				// set defaults to your columns
				.setColumnsDefaults({
					headerBorder: 'B',
					align: 'left',
					border: 'LTBR',
					headerBorder: 'LTBR',
					borderOpacity: 0.2,
					headerBorderOpacity: 0.2,
					headerPadding: 2,
					padding: 2,
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
			
			doc.moveDown(1);
		}
	}
	
	drawActions.h1(doc, {value:'Unit Overview'});
	
	drawActions.h2(doc, {value:'Introduction'});
	
	const introductions=[
		{title: 'Challenge', field:'introduction_challenge_description'},
		{title: 'Phenomena', field:'introduction_phenomena_description'},
		{title: 'Science Methods', field:'introduction_science_methods_description'},
		{title: 'Culminating Experience', field:'introduction_culminating_experience_description'},
	]
	
	introductions.forEach(item=>{
		  
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
	
	
	await asyncForEach([
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
		
	], async(item)=>{
		blocks.push({
			type: item.headerType || 'h2',
			value: item.title
		})
		const root=parse(cleanUpHTML(unit[item.field]));
	
		await asyncForEach(root.childNodes/*.filter(node=>node.tagName==='p')*/, async (el)=>{
			await parseHTMLIntoBlocks(el);
		});
		if (item.breakAfter){
			blocks.push({
				type: 'pageBreak'
			})
		}
	});
	blocks.push({
		type: 'h1',
		value: 'Materials'
	})
	
	await asyncForEach([
		{title: 'Materials List Information', field:'materials_desc'},
		{title: 'Safety Guidelines', field:'materials_safety_guidelines'},
		
	], async(item)=>{
		blocks.push({
			type: item.headerType || 'h2',
			value: item.title
		})
		const root=parse(cleanUpHTML(model[item.field]));
	
		await asyncForEach(root.childNodes/*.filter(node=>node.tagName==='p')*/, async (el)=>{
			await parseHTMLIntoBlocks(el);
		});
		if (item.breakAfter){
			blocks.push({
				type: 'pageBreak'
			})
		}
	});
	
	[{
		title: 'Materials Provided by School/Teacher:',
		data: materials.filter(m=>m.name && m.optionalInd===0)
	},
	{
		title: 'Optional Materials',
		data: materials.filter(m=>m.name && m.optionalInd===1),
		headerType: 'h3'
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
	
	
	
	//console.log(blocks);
	
	
	
	
	let currentH2;
	blocks.forEach((item, i)=>{
		if (item.type=='h2'){
			currentH2=item;
		}
		if (item.type=='p' && blocks[i+1] && blocks[i+1].type==='image' && (doc.y+blocks[i+1].heigth)>740){
			doc.addPage();
			if (currentH2){
				drawActions[currentH2.type](doc, currentH2);
			}
		}
		if (item.type=='h2' && blocks[i+1] && blocks[i+1].type==='image' && (doc.y+blocks[i+1].heigth)>740){
			doc.addPage();
		}
		drawActions[item.type](doc, item);
	});
	
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
	
	doc.end();
	
	
}
main().then(res=>{
	console.log(res);
}).catch(err=>{
	console.log('Error');
	console.log(err);
})