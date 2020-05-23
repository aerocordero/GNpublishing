async function main() {
	const mysql = require('mysql2');
	const bluebird = require('bluebird');
	const PDFDocument = require('pdfkit');
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
		getImgPropHeigth
	} = require('./lib/utils');
	
	//config.db.Promise=bluebird;

	const pool =  mysql.createPool(config.db);
	const db=pool.promise();
	const testData={
		unit: require('./test-data/unit.json'),
	}
	
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
	
	
	
	console.log('Connected to the DB');
	
	
	const unitId=17;
	
	const unit=testData.unit || (await db.query('SELECT * FROM `unit` t WHERE t.`unit_id` = ?', [unitId]))[0];
	
	//console.log(JSON.stringify(unit, null, 4));
	console.log(unit);
	//console.log((await db.query('SELECT * FROM `lesson` t WHERE t.`lesson_id` = ?', [2]))[0]);
	
	const doc = new PDFDocument({
  		bufferPages: true
  	});
	let pageNum=1;
 
	doc.pipe(fs.createWriteStream('output.pdf'));
	
	const writeHeader=(doc)=>{
		doc.x=60;
		
		doc
		  .moveTo(60, 30)
		  .font(fonts.semiBold)
		  .fontSize(16)
		  .text('Unit 1:', 60, 30);
	  
		doc
		  .font(fonts.semiBold)
		  .fontSize(16)
		  .text('Unit Overview', 370, 30);
	  
	
		doc
		.image('images/unit_header.jpg', 490, 15, {
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
		if (textNodes.length){
			blocks.push({
				type: 'p',
				value: textNodes,
				isHtml: true,
			});
			textNodes=[];
		}
	}
		
	writeHeader(doc);
	
	doc
	  .font(fonts.regular)
	  .fontSize(17)
	  .fill('black')
	  .text('Unit Overview', textIdents.left, textIdents.top);
	  
	doc.moveDown(1);
	  
	addH2(doc, 'Introduction');
	
	doc.moveDown(0.3);
	
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
		{title: 'Prior Knowledge', field: 'ngss_description', breakAfter: true},
		{title: 'Assessment', field: 'assessment'},
		
	], async(item)=>{
		blocks.push({
			type: 'h2',
			value: item.title
		})
		const root=parse(unit[item.field]);
	
		await asyncForEach(root.childNodes.filter(node=>node.tagName==='p'), async (el)=>{
			await parseHTMLIntoBlocks(el);
		});
		if (item.breakAfter){
			blocks.push({
				type: 'pageBreak'
			})
		}
	})
	console.log(blocks);
	
	const drawActions={
		pageBreak: (doc, item)=>{
			doc.addPage();
		},
		h2: (doc, item)=>{
			if (doc.y>660){
				doc.addPage();
			}
			addH2(doc, item.value);
		},
		p: (doc, item)=>{
			if (item.isHtml){
				const tagFonts={
					em: fonts.italic,
					b: fonts.bold,
					strong: fonts.bold,
				}
				item.value.forEach(node=>{
					doc.fillColor('black')
						.font(tagFonts[node.tagName] || fonts.regular)
						.lineGap(2)
						.fontSize(10)
				   .text(decodeHtml(node.text), {
						width: 465,
						continued: true,
						lineBreak: true,
						align: 'left'
				   });
				});
			}
			else {
				doc.fillColor('black')
					.font(fonts.regular)
					.lineGap(4)
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
		} 
	}
	
	
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