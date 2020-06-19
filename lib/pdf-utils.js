const PdfTable = require('./voilab-table');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const _ = require('lodash');
const {
		decodeHtml,
		asyncForEach,
		imageInfo,
		getImgPropHeigth,
		cleanUpHTML
	} = require('./utils');

class PDFUtils {

	isRightPage(){
		return this.pageNum%2>0;
	}

	constructor (colors, fonts, textIdents){
		this.colors=colors;
		this.fonts=fonts;
		this.textIdents=textIdents;
		this.contents=[];
		this.headerTitles=[];
		this.pageNum=0;
		this.headers={};
		this.footers={};
		this.startPagingPage=0;
		
		this.drawActions={
			pageBreak: (doc, item)=>{
				if (item.headerTitle){
					this.currentTitle=item.headerTitle;
				}
				doc.addPage();
			},
			h1: (doc, item)=>{
				if (item.startOnRightSide && this.isRightPage()){
					this.currentTitle=null;
					doc.addPage();
				}
				this.currentTitle=item.headerTitle || this.headerTitles.find(t=>t.titleRight===item.value);
				doc.addPage();
				doc
				  .font(fonts.regular)
				  .fontSize(17)
				  .fill('black')
				  .text(item.value, textIdents.left, textIdents.top);
				doc.moveDown(item.paddingBottom || 0.5);
				if (item.addContents){
						this.drawActions.contentsPush(doc, {title:item.value, level:1, color:colors.black});
				}
			},
			h2: (doc, item)=>{
				if (item.headerTitle){
					this.currentTitle=item.headerTitle;
					doc.addPage();
				}
			
				if (doc.y>660){
					doc.addPage();
				}
				if (doc.y>130){
					doc.moveDown(1);
				}
			
				const y=doc.y;
				doc
				  .font(fonts.bold)
				  .fontSize(13.5)
				  .fill('black')
				  .text(item.value, textIdents.left);
  
				if (item.rightText){
					doc
					  .font(fonts.bold)
					  .fontSize(13.5)
					  .text(item.rightText, 70, y, {
						width: 460,
						align: 'right'
					  });
				}
			
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
				const fonts=this.fonts;
				const textIdents=this.textIdents;
				
				if (headerTitle){
					this.currentTitle=headerTitle;
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
				  .text(value, textIdents.left, y, {
					width: 350,
					continued: false,
					lineBreak: true,
				  });
				const afterTextY=doc.y;
				doc
				  .font(fonts.semiBold)
				  .fontSize(14)
				  .text(rightText, 70, y, {
					width: 460,
					align: 'right'
				  });
				doc.y=afterTextY;
			  
				doc.moveDown(0.2);
				doc
					.font(fonts.regular)
					.fontSize(10)
					.fill('black')
			},
			p: (doc, item)=>{
				const params=item.params || {};
				let ident=params.ident || 0;
				let width=params.width || 465;
				let moveDown=params.moveDown || 0;
				let addSpaceAfter=params.addSpaceAfter!==undefined ? params.addSpaceAfter : true;
				if (item.isHtml){
					if (doc.y>725){
						doc.addPage();
					}
					const convertHTMLString=(str)=>{
						//console.log('convertHTMLString', _.keys( params), str)
						if (item.params && item.params.replaceFn){
							str=item.params.replaceFn(str);
						}
						return this.convertHtml(str);
					}
			
					let parentTagName='';
					let parentClass='';				
					if (item.parentEl && item.parentEl.getAttribute){
						parentTagName=item.parentEl.tagName;
						parentClass=item.parentEl.getAttribute('class') || '';
					}
				
					const tagFonts={
						em: fonts.italic,
						b: fonts.bold,
						strong: fonts.bold,
						semiBold: fonts.semiBold,
					}
					const tagFeatures={
						sup: ['sups'],
						sub: ['subs'],
					}
					item.startPage=this.pageNum;
					if (parentTagName === 'div' && parentClass.indexOf('tips-box') >=0) {
						const boxColors={
							sep: ['#82B1D4', '#25408F'],
							ccc: ['#DAE2CA', '#7DA953']
						}
						const boxType=parentClass.indexOf('sep') > 0 ? 'sep' : 'ccc';
						ident=12;
						moveDown=0.2;
						const boxH=doc.heightOfString(item.value.map(n=>n.text).filter(txt=>txt && txt!=='\n').join('\n'), {
							width: 465-(ident*2),
							//continued: false
						})+(ident*2)+20;
						if (boxH+doc.y>750){
							doc.addPage();
							//doc.y+=ident;
						}
						doc.y+=ident*2;
					
						const rect={
							x: doc.x,
							y: doc.y-ident,
							h: boxH
						}
						doc
						  .save()
						  .lineWidth(2)
						  .roundedRect(rect.x, rect.y, 465, rect.h, 10)    
						  .fill(boxColors[boxType][0])
						  .roundedRect(rect.x, rect.y, 465, rect.h, 10)
						  .stroke(boxColors[boxType][1]);
					  
						doc
						  .font(fonts.bold)
						  .fontSize(12)
						  .fill('black')
						  .text('3-D Instructional Reminder', textIdents.left+ident);
						doc.moveDown(0.2);
						doc
							.font(fonts.regular)
							.fontSize(10)
							.fill('black')
					
					}
					item.value.forEach((node, index)=>{
						//console.log('tagName', node.tagName, parentTagName, parentClass);
						//console.log(node.text);
						if (parentTagName ==='ul' && node.tagName ==='li'){
							const listText=convertHTMLString(node.text).replace(/\n/g, '').trim();
							const lists=[];
							//console.log('str:', node.childNodes, node.childNodes.map(node=>node.tagName));
							if (!node.querySelector('ul')){
								lists.push(convertHTMLString(node.text).replace(/\n/g, '').trim());
							}
							else {
								node.childNodes.forEach(node=>{
									//console.log('str inner:', node.childNodes.map(node=>node.tagName));
									if (!node.childNodes.filter(node=>node.tagName==='li').length){
									//if (node.childNodes.length<2){
										const text=convertHTMLString(node.text).replace(/\n/g, '').trim();
									
										if (text){
											lists.push(text);
										}
										//console.log('text: ', text);
								
									}
									else {
										const texts=node.childNodes.map(n=>convertHTMLString(n.text).replace(/\n/g, '').trim());
										if (texts.length){
											lists.push(texts.filter(t=>t));
										}
								
									}	
								})
							}
						
							//console.log(lists, item);
						
							doc.fillColor('black')
								.font(tagFonts[node.tagName] || fonts.regular)
								.list(lists, textIdents.left+(params.listsIdent || 0), doc.y, {
									bulletIndent: 50,
									//textIndent: 20,
									bulletRadius:3,
								});	
						
							if (node.addSpaceAfter !==undefined && !node.addSpaceAfter){
								addSpaceAfter=false;
							}
							else {
								addSpaceAfter=true;
							}
								
						}
						else if (parentTagName === 'div'){	
							if (node.rawText!=='\n'){
								//console.log(node.childNodes);
								this.drawActions.p(doc, {
									value: node.childNodes,
									isHtml: true,
									parentEl: node,
									params: _.extend(params, {
										ident:ident,
										width: 465-(ident*2),
									})
								});
							}
						}
						else {
							let str=node.text;						
							//console.log(node);
							//console.log(doc.x, doc.y);
							//console.log(doc.prevPage, pageNum, doc.prevY);
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
							if (parentClass && parentClass.indexOf('bold-text') >=0) {
								node.tagName='semiBold';
							}						
							if (node.tagName==='br'){
								//doc.moveDown(0.2);
								doc.text(' ', textIdents.left, doc.y, {
									width,
									continued: false
							   });
							}
							doc.fillColor(styles.color || 'black')
								.font(tagFonts[node.tagName] || fonts.regular)
								.lineGap(1.2)
								.fontSize(10)
						   .text(convertHTMLString(str)/*.trimStart()*/, textIdents.left+(ident || 0), doc.y, {
								width,
								continued: true,
								lineBreak: true,
								align: 'left',
								//wordSpacing: 0.1,
								features: tagFeatures[node.tagName] || [],
						   });
						   doc.prevX=doc.x;
						   doc.prevY=doc.y;
						   //console.log('doc.prevX', doc.prevX);
						   doc.prevPage=this.pageNum;
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
						width,
						continued: true
				   });
				}
				if (addSpaceAfter){
					doc.text(' ', {
						width,

						continued: false
					});
				}
			
				item.endPage=this.pageNum;
				if (moveDown){
					doc.moveDown(moveDown);
				}
				doc.x=textIdents.left;
		   
			},
			image:(doc, item)=>{
				if (doc.y+item.heigth>840){
					doc.addPage();
				}
				else {
					doc.moveDown(0.5);
				}
				//console.log(doc.x, doc.y);
				//console.log(item);
				doc.image(item.value, {width: item.width || 465});
				doc.moveDown(0.5);
			},
			images:(doc, item)=>{
				if (doc.y+item.value[0].heigth>740){
					doc.addPage();
				}
				let y=doc.y;
				item.value.forEach(image=>{
					if (doc.y+image.heigth>740 && image.x<textIdents.left+40){
						doc.addPage();
						y=doc.y;
					}
					else if (!image.x || image.x<textIdents.left+40) {
						doc.moveDown(0.5);
						y=doc.y;
					}
					if (image.x && image.x > textIdents.left+40){
						doc.y=y;
					}
					doc.x=image.x;				
					//console.log(doc.x, doc.y, y, image.x);
					const imgX = doc.x;
					const imgY = doc.y;
					doc.image(image.path, {width: image.width || 465});
					doc.rect(imgX, imgY, image.width, image.heigth).stroke();
				})
				doc.x=textIdents.left;
				//console.log(doc.x, doc.y);
				//console.log(item);
				doc.moveDown(0.5);
			},
			table: (doc, {columns, data, fontSize, hideHeaders, borderColor})=>{
				//console.log({columns, data});
				let table = new PdfTable(doc, {
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
				this.currentTitle=null;
				doc.addPage();
				if (!this.isRightPage()){
					doc.addPage();
				}
				if (!this.startPagingPage){
					this.startPagingPage=this.pageNum-1;
				}
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
					this.drawActions.contentsPush(doc, {title, level:0, color});
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
			pptSlide: (doc, {value, imgInfo, file}) =>{
		
				const width=170;
				const heigth=getImgPropHeigth(imgInfo, width);
				const text=value.text ? 'Notes \n \n'+value.text : '';
				const textOptions={
					width: 465-(width+15),
					continued: false
				};
			
				const textHeight=doc.heightOfString(text, textOptions);
				const maxHeight=textHeight > heigth ? textHeight : heigth;
			
				if (doc.y+(maxHeight+30)>750){
					doc.addPage();
				}
				else {
					doc.moveDown(0.5);
				}
				const startPage=this.pageNum;
				if (file && !file.page){
					file.pageNum=this.pageNum-this.startPagingPage;
					file.page='Page '+file.pageNum+' (Visual Reference)';	
					file.inlinePageRef='digital access required';	
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
			
				const imgX = doc.x;
				const imgY = doc.y;
				doc.image(value.imagePath, {width: width});
				doc.rect(imgX, imgY, width, heigth).stroke();
			
			
				const yAfterImage=doc.y;
			
				doc.fillColor('black')
					.font(fonts.regular)
					.lineGap(0.6)
					.fontSize(10)
				.text(text, textIdents.left+width+15, y, textOptions);
				doc.x=textIdents.left;
				doc.y=yAfterImage > doc.y && startPage===this.pageNum ? yAfterImage : doc.y 
			
				doc.moveDown(0.5);
			},
			introductions: (doc, {value, imgInfo, data}) =>{
				value.forEach(item=>{
					doc.fillColor(colors.green)
						.font(fonts.regular)
						.lineGap(4)
						.fontSize(10)
					   .text(item.title+': ', {
						 width: 465,
						 continued: true
					   }).fillColor('black')
					   .text(data[item.field]);
				});
				doc.moveDown(1);
			},
			contentsPush: (doc, {title, level, color})=>{
				this.contents.push({title, level, color, pageNum:this.pageNum-this.startPagingPage});
				//console.log(doc.page);
			},
			contents: (doc)=>{
				if (!this.contents.length){
					doc.addPage();
					this.contentsPage=this.pageNum;
					return;
				}
			
				//console.log(doc.page);
			},
			lessonFiles: (doc, {value, file, contentsObj})=>{
				let contentsPushed;
				value.forEach(image=>{
					doc.addPage();
					if (contentsObj && !contentsPushed){
						this.drawActions.contentsPush(doc, contentsObj);
						contentsPushed=true;
					}
					doc.x=12;
					doc.y=0;
					doc.image(image.path, {width: 600});
					doc
					  .save()
					  .moveTo(0, 730)
					  //.lineTo(50, 40)
					  .lineTo(650, 730)
					  .lineTo(650, 800)
					  .lineTo(0, 800)
					  .fill('white');
					this.footers[this.pageNum]={
						leftText: file.fileTitle
					};
				});
				file.pageNum=this.pageNum-this.startPagingPage;
				file.page='Page '+file.pageNum;
				file.inlinePageRef='page '+file.pageNum;	
				//console.log(file);
			}
		}
	}
	
	writeHeader(doc, header){
		if (!header){
			return;
		}
		//doc.x=60;
		
		doc
		  .moveTo(60, 30)
		  .font(this.fonts.semiBold)
		  .fontSize(16)
		  .text(header.titleLeft, 60, 30);
	  
		doc
		  .font(this.fonts.semiBold)
		  .fontSize(16)
		  .text(header.titleRight, 70, 30, {
		  	width: 410,
		  	align: 'right'
		  });
	  
	
		doc
		.image(header.icon, 490, 15, {
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
		  .fill(header.color || this.colors.unitTitle);	
		
	}
	
	saveHeader(){
		this.headers[this.pageNum]=this.currentTitle;
		//console.log('this.headers', this.headers, )
	}
	
	addNewPage(doc){
	   	this.saveHeader();
	}
	
	generatePdf(pdfFileName, blocks){
		const doc = new PDFDocument({
			bufferPages: true,
			autoFirstPage: false ,
			margins: {
				top: 85,
				bottom: 45,
				left: 77,
				right: 70
			  }
		});
	
		this.pageNum=0;
		this.headers={};
		this.footers={};
		this.contents=[];
	
		doc.pipe(fs.createWriteStream(pdfFileName));
	
		doc.on('pageAdded', () => {
			this.pageNum++;
			this.addNewPage(doc);
		});
	
		let currentH2;
		
		blocks.forEach((item, i)=>{
			if (item.type=='p' && blocks[i+1] && ['h1', 'pageBreak', 'sectionCover'].indexOf(blocks[i+1].type)>=0 && item.startPage && item.endPage && item.startPage<item.endPage){
				item.lastParagraph=true;
				const needToMove=item.startPage<item.endPage;
				let breakIndex=i;
				if (blocks[i-1] && blocks[i-1].type==='h2'){
					blocks[i-1].lastParagraph=true;
					breakIndex=i-1;
				}
				if (needToMove && blocks[breakIndex].type!=='pageBreak' && blocks[breakIndex-1].type!=='pageBreak') {	
					//console.log(breakIndex);
					blocks.splice(breakIndex, 0, {
						type: 'pageBreak',
					})					
				}
			}
		});
		
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
					this.drawActions[currentH2.type](doc, currentH2);
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
			//const textLen=node.text.length;		
			if (item.type=='p' && _.isArray(item.value) && blocks[i-1].type==='p'){
				const textHeight=doc.heightOfString((item.value || []).map(n=>n.text).join(''), {
					width: 465,
				});		
				//console.log('textHeight', textHeight, doc.y, item.value)		;
				if (textHeight+doc.y>750 && textHeight+doc.y < 770){
					doc.addPage();
				}	
			}	
			
			this.drawActions[item.type](doc, item);
			//console.log(item);
		});
		//console.log(contents);
	
		//adding page numbers
		const range = doc.bufferedPageRange(); // => { start: 0, count: 2 }
		//console.log('this.headers', this.headers);
		let i;
		let end;
		for (i = range.start, end = range.start + range.count, range.start <= end; i < end; i++) {
		  doc.switchToPage(i);
		  this.writeHeader(doc, this.headers[i+1]);
		  //doc.text(`Page ${i + 1} of ${range.count}`);
		  doc.page.margins.bottom=0;
		  if (i+1 > this.startPagingPage){
		  	doc
				.font(this.fonts.regular)
				.fontSize(9)
				.fill('black')
				.text(i+1-this.startPagingPage, this.textIdents.left, 750, {
					width: 465,
					continued: false,
					align: 'center'
				});
				if (this.footers[i+1]){
					doc
					  .font(this.fonts.regular)
					  .fontSize(8)

					  .text(this.footers[i+1].leftText, this.textIdents.left, 730);
				}
			}
		  }
		  
		if (this.contentsPage && this.contents.length){
			doc.switchToPage(this.contentsPage-1);
			//drawActions.contents(doc);
			
			doc
			  .font(this.fonts.bold)
			  .fontSize(24)
			  .text('Table of Contents', this.textIdents.left, 30, {
				width: 465,
				align: 'left',
				continued: false
			  });
			this.drawActions.line(doc);
			
			doc.moveDown(0.2);
			
			this.contents.forEach(item=>{
				const y=doc.y;
				let lineStart;
				const lineY=doc.y+11;
				if (item.level===0){
					doc
					  .font(this.fonts.bold)
					  .fontSize(12)
					  .fillColor(item.color || 'black')
					  .text(item.title, this.textIdents.left, y, {
						align: 'left'
					  });
					lineStart=doc.x+(item.title.length*6)+8;
					doc
					  .font(this.fonts.bold)
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
					  .font(this.fonts.regular)
					  .fontSize(10)
					  .fillColor(item.color || 'black')
					  .text(item.title, this.textIdents.left+20, y, {
						width: 465,
						align: 'left'
					  });
					lineStart=doc.x+(item.title.length*5)+5;
					doc
					  .font(this.fonts.regular)
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

			   doc.moveDown(0.1);
			   if (doc.y > 750){
			   		doc.switchToPage(this.contentsPage);
			   		doc.y=80;
			   }
			})
			
		}
	
		doc.end();
	}

}

module.exports = PDFUtils;