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
		this.textWidth=465;
		this.defaultFontSize=10;
		
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
				if (!item.dontChangeCurrentTitle){
					this.currentTitle=item.headerTitle || this.headerTitles.find(t=>t.titleRight===item.value);
				}				
				let y=textIdents.top;
				let x=textIdents.left;
				if (item.leftIdent){
					x=item.leftIdent;
				}
				if (item.noHeader){
					this.currentTitle=null;
					y=30;
				}
				doc.addPage();
				if (item.value){
					doc
					  .font(fonts.regular)
					  .fontSize(item.fontSize || 17)
					  .fill(item.color || 'black')
					  .text(item.value, x, y);
					doc.moveDown(item.paddingBottom || 0.5);
				}
				
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
				const leftTextIdent=item.leftTextIdent || textIdents.left
			
				const y=doc.y;
				doc
				  	.font(fonts.bold)
				  	.fontSize(item.fontSize || 13.5)
				  	.fill(item.titleColor || 'black')
				  	.text(item.value, leftTextIdent, y, {
				  		width: this.textWidth,
				  		align: item.align || 'left'
				  	});
  
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
				doc.moveDown(item.marginTop || 0);
				doc
				  .font(fonts.bold)
				  .fontSize(item.fontSize || this.defaultFontSize)
				  .fill(item.titleColor || 'black')
				  .text(item.value, textIdents.left);
				doc.moveDown(item.marginBottom || 0.2);
				doc
					.font(fonts.regular)
					.fontSize(10)
					.fill('black')
			},
			h4: (doc, item)=>{
				doc.moveDown(item.marginTop || 0);
				doc
				  .font(fonts.boldItalic)
				  .fontSize(item.fontSize || this.defaultFontSize)
				  .fill(item.titleColor || 'black')
				  .text(item.value, textIdents.left);
				doc.moveDown(item.marginBottom || 0.2);
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
				let width=params.width || this.textWidth;
				let moveDown=params.moveDown || 0;
				let addSpaceAfter=params.addSpaceAfter!==undefined ? params.addSpaceAfter : true;
				let addSpaceAfterSize=params.addSpaceAfterSize || 10;
				const leftTextIdent=params.leftTextIdent || textIdents.left;
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
							width: this.textWidth-(ident*2),
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
						  .roundedRect(rect.x, rect.y, this.textWidth, rect.h, 10)    
						  .fill(boxColors[boxType][0])
						  .roundedRect(rect.x, rect.y, this.textWidth, rect.h, 10)
						  .stroke(boxColors[boxType][1]);
					  
						doc
						  .font(fonts.bold)
						  .fontSize(12)
						  .fill('black')
						  .text('3-D Instructional Reminder', leftTextIdent+ident);
						doc.moveDown(0.2);
						doc
							.font(fonts.regular)
							.fontSize(this.defaultFontSize)
							.fill('black')
					
					}
					item.value.forEach((node, index)=>{
						//console.log('tagName', node.tagName, parentTagName, parentClass);
						//console.log(node.text);
						if (parentTagName ==='ul' && node.tagName ==='li' && !params.processListsAsBlocks){
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
								.list(lists, leftTextIdent+ident+(params.listsIdent || 0), doc.y, {
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
						else if (parentTagName ==='ul' && node.tagName ==='li' && params.processListsAsBlocks){	
							const liIdent=15;
							if (node.rawText!=='\n'){
								//console.log(parentTagName, node.tagName, node.rawText);
								doc
								.lineGap(0.3)
								.fontSize(5)
								.text(' ', leftTextIdent+ident, doc.y,{
									width,
									continued: false
								});
								doc.x=leftTextIdent+ident;
								doc.circle(leftTextIdent+ident+3+(params.listsIdent || 0), doc.y+7, 2)	
								   .fill("black");
								this.drawActions.p(doc, {
									value: node.childNodes,
									isHtml: true,
									parentEl: node,
									params: {
										ident:liIdent+ident+(params.listsIdent || 0),
										width: width-(liIdent)-(params.listsIdent || 0),
										leftTextIdent: leftTextIdent,
										lineGap: params.lineGap,
										addSpaceAfterSize: 8,
										processListsAsBlocks: true,
									}
								});

								addSpaceAfter=true;		
								addSpaceAfterSize=8;						
							}
							doc.x=leftTextIdent;							
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
										width: this.textWidth-(ident*2),
									})
								});
							}
						}
						else {
							let str=node.text;						
							//console.log(node);
							//console.log(doc.x, doc.y);
							//console.log(doc.prevPage, pageNum, doc.prevY);
							const processNode=(node, styles)=>{
								if (!styles){
									styles={};
								}
								
								
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
									doc.fillColor('black').text(' ', leftTextIdent, doc.y, {
										width,
										continued: false
								   });
								}

								//console.log(node.structure.length);
								
								if (node.childNodes && node.childNodes.length>1){
									//node.childNodes.forEach(n=>processNode(n, styles));
									//return;
								}
							
								doc.fillColor(styles.color || 'black')
									.font(tagFonts[node.tagName] || fonts.regular)
									.lineGap(params.lineGap || 1.2)
									.fontSize(params.fontSize || this.defaultFontSize)
							   .text(convertHTMLString(str)/*.trimStart()*/, leftTextIdent+(ident || 0), doc.y, {
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
							};
							
						   //console.log(node.tagName, tagFeatures[node.tagName]);
						   processNode(node, {});
						}
						
						
					
					});
				}
				else {
					doc.fillColor('black')
						.font(fonts.regular)
						.lineGap(1.6)
						.fontSize(this.defaultFontSize)
				   .text(item.value, leftTextIdent+(item.ident || 0), doc.y,{
						width,
						continued: true
				   });
				}
				if (addSpaceAfter){
					doc
					.lineGap(1)
					.fontSize(addSpaceAfterSize)
					.text(' ', {
						width,

						continued: false
					})
					.font(fonts.regular)
					.fontSize(this.defaultFontSize)
					.lineGap(params.lineGap || 1.2);
				}
			
				item.endPage=this.pageNum;
				if (moveDown){
					doc.moveDown(moveDown);
				}
				doc.x=textIdents.left;
		   
			},
			image:(doc, item)=>{
				const prevX=doc.x;
				const prevY=doc.y;
				if (doc.y+item.heigth>840){
					doc.addPage();
				}
				else {
					doc.moveDown(item.marginTop || 0.5);
				}
				if (item.align==='center'){
					doc.x=textIdents.left+(this.textWidth-(item.width || 0))/2;
				}
				if (item.y){
					doc.y=item.y;
					doc.x=item.x;
					//doc.save();
				}
				//console.log(doc.x, doc.y);
				//console.log(item);
				doc.image(item.value, {width: item.width || this.textWidth});
				if (item.y){
					doc.x=prevX;
					doc.y=prevY;
					//doc.save();
				}
				else {
					doc.moveDown(0.5);
				}
				
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
					doc.image(image.path, {width: image.width || this.textWidth});
					doc.rect(imgX, imgY, image.width, image.heigth).stroke();
				})
				doc.x=textIdents.left;
				//console.log(doc.x, doc.y);
				//console.log(item);
				doc.moveDown(0.5);
			},
			table: (doc, {columns, data, fontSize, hideHeaders, borderColor, headerColor})=>{
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
						headerColor: headerColor || 'black',
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
					width: this.textWidth,
					continued: false
				});
				doc.moveDown(0.2);
			},
			setStartPagingPage: ()=>{
				if (!this.startPagingPage){
					this.startPagingPage=this.pageNum-1;
				}
			},
			sectionCover: (doc, params)=>{
				this.writeSectionCover(doc, params);
			},
			list: (doc, {value, ident, notMoveDownAfter})=>{
		
				doc.fillColor('black')
					.font(fonts.regular)
					.list(value, textIdents.left+(ident || 0), doc.y, {
						bulletIndent: 50,
						//textIndent: 20,
						bulletRadius:3,
					});	
				if (!notMoveDownAfter){
					doc.text(' ', textIdents.left, doc.y, {
						width: this.textWidth,
						continued: false
					});
				}
				
			},
			line: (doc, {leftIdent, width}) => {
				doc.moveDown(0.2);
				doc.lineWidth(1)
					.strokeColor('#999')
				   .moveTo(leftIdent || 55, doc.y)
				   .lineTo(width || 550, doc.y)
				   .stroke();
				doc.moveDown(0.2);
			},
			pptSlide: (doc, {value, imgInfo, file}) =>{
		
				const width=170;
				const heigth=getImgPropHeigth(imgInfo, width);
				const text=value.text ? 'Notes \n \n'+value.text : '';
				const textOptions={
					width: this.textWidth-(width+15),
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
					file.inlinePageRef='online access';	
				}
			
				doc.fillColor('black')
					.font(fonts.bold)
					.lineGap(1.6)
					.fontSize(10)
				.text('Slide '+value.slideNum, {
					width: this.textWidth,
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
			introductions: (doc, {value, imgInfo, data, color, titleFont, fontSize, leftIdent, paddingBottom}) =>{
				value.forEach(item=>{
					doc.fillColor(color || colors.green)
						.font(titleFont || fonts.regular)
						.lineGap(4)
						.fontSize(fontSize || 10)
					   .text(item.title+': ', leftIdent || textIdents.left, doc.y, {
						 width: this.textWidth,
						 continued: true
					   }).fillColor('black').font(fonts.regular)
					   .text(data[item.field]);
					if (paddingBottom){
						doc.moveDown(paddingBottom);
					}					
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
			lessonFiles: (doc, {value, file, contentsObj, leftIdent, width, bottomBoxY, headerParams, rightBoxX, firstPageMove, leftBoxWidth})=>{
				if (!bottomBoxY){
					bottomBoxY=730;
				}
				let contentsPushed;
				/*
				if (this.isRightPage()){
					this.currentTitle=null;
					doc.addPage();
				}*/
				
				value.forEach((image, index)=>{
					if (headerParams){
						this.currentTitle=headerParams;
					}
					doc.addPage();
					if (contentsObj && !contentsPushed){
						this.drawActions.contentsPush(doc, contentsObj);
						contentsPushed=true;
					}
					doc.x=leftIdent || 0;
					doc.y=0;
					let bottomBoxYVal=bottomBoxY;
					if (firstPageMove && !index){
						doc.y=firstPageMove;
						bottomBoxYVal+=firstPageMove;
					}
					doc.image(image.path, {
						width: width || 612,
						heigth: 792,
						valign: 'center'
					});
					doc
					  .save()
					  .moveTo(0, bottomBoxYVal)
					  //.lineTo(50, 40)
					  .lineTo(650, bottomBoxYVal)
					  .lineTo(650, bottomBoxYVal+79)
					  .lineTo(0, bottomBoxYVal+79)
					  .fill('white');
					if (rightBoxX){
						doc
						  .save()
						  .moveTo(rightBoxX, 48)
						  //.lineTo(50, 40)
						  .lineTo(700, 48)
						  .lineTo(700, 750)
						  .lineTo(rightBoxX, 750)
						  .fill('white');					
					}
					if (leftBoxWidth){
						doc
						  .save()
						  .moveTo(0, 48)
						  //.lineTo(50, 40)
						  .lineTo(leftBoxWidth, 48)
						  .lineTo(leftBoxWidth, 750)
						  .lineTo(0, 750)
						  .fill('white');
					}
					this.footers[this.pageNum]={
						leftText: file.fileTitle
					};
				});
				file.pageNum=this.pageNum-this.startPagingPage;
				file.page='Page '+file.pageNum;
				file.inlinePageRef='page '+file.pageNum;	
				//console.log(file);
			},
			setFooter: (doc, params)=>{
				this.footers[this.pageNum]=params;
			},
			custom: (doc, {drawFn})=>{
				drawFn(doc);
			}
		}
		
		this.tocStyles={
			title: {
				color: 'black',
				idents: [this.textIdents.left, 30],
				font: this.fonts.bold,
				fontSize: 24,
			},
			level0: {
				font: this.fonts.bold,
				fontSize: 12,
			},
			level1: {
				font: this.fonts.regular,
				fontSize: 10,
			},
			levelIdent: 20,
			width: this.textWidth,
			moveDown: 0.1
		}
	}
	writeSectionCover (doc, {title, image, color, addContents}) {		
	
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
		  .font(this.fonts.semiBold)
		  .fontSize(36)
		  .text(title, this.textIdents.left, 80, {
			width: this.textWidth,
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
	
	drawCircleDotsLine(doc, x, y, width, radius, color){
		if (!radius){
			radius=1;
		}
		const space=radius*3;
		const maxNum=parseInt(width/(radius+space));		
		for (var i=0; i<=maxNum; i++){
			doc.circle(x, y, radius)
			   .fill(color);
			x+=radius+space;
		}
	}
	
	writeContents(doc){
		const s=this.tocStyles;
		doc
		  .font(s.title.font)
		  .fontSize(s.title.fontSize)
		  .fillColor(s.title.color || 'black')
		  .text('Table of Contents', s.title.idents[0], s.title.idents[1], {
			width: s.width,
			align: 'left',
			continued: false
		  });
		this.drawActions.line(doc, s.lineParams || {});
		
		doc.moveDown(0.2);
		const leftIdent=s.leftIdent || this.textIdents.left;
		
		this.contents.forEach(item=>{
			const y=doc.y;
			let lineStart;
			const lineY=doc.y+11;
			if (item.level===0){
				doc
				  .font(s.level0.font)
				  .fontSize(s.level0.fontSize)
				  .fillColor(item.color || 'black')
				  .text(item.title, leftIdent, y, {
					align: 'left'
				  });
				if (item.pageNum){
					lineStart=doc.x+doc.widthOfString(item.title, {
						font: s.level0.font,
					  	fontSize: s.level0.fontSize
					})+7;
					
					doc
					  .font(s.level0.font)
					  .fontSize(s.level0.fontSize)
					  .text(item.pageNum, 70, y, {
						width: s.width-5,
						align: 'right'
					  });
					this.drawCircleDotsLine(doc, lineStart, lineY, (s.width+55)-((item.pageNum+'').length*3)-lineStart, 0.5, item.color);
				  /*
					doc.lineWidth(1.5)
						.strokeColor(item.color)
						.moveTo(lineStart, lineY)
						.lineTo((s.width+55)-((item.pageNum+'').length*6), lineY)
						.dash(2, {space: 2})
						.stroke();
						*/
				}
			}
			if (item.level===1){
				doc
				  .font(s.level1.font)
				  .fontSize(s.level1.fontSize)
				  .fillColor(item.color || 'black')
				  .text(item.title, leftIdent+s.levelIdent, y, {
					width: s.width,
					align: 'left'
				  });
				lineStart=doc.x+doc.widthOfString(item.title, {
					font: s.level1.font,
					fontSize: s.level1.fontSize
				})+5;
				doc
				  .font(s.level1.font)
				  .fontSize(s.level1.fontSize)
				  .text(item.pageNum, 70, y, {
					width: s.width-5,
					align: 'right'
				  });
				
				this.drawCircleDotsLine(doc, lineStart, lineY-2, (s.width+55)-((item.pageNum+'').length*3)-lineStart, 0.5, item.color || 'black');
				/*
				doc.lineWidth(1)
					.strokeColor(item.color || 'black')
					.moveTo(lineStart, lineY-2)
					.lineTo((s.width+55)-((item.pageNum+'').length*6), lineY-2)
					.dash(2, {space: 2})
					.stroke();
				*/
			}
			if (s.moveDown){
				doc.moveDown(s.moveDown);
			}		   	
		   	if (doc.y > 750){
				doc.switchToPage(this.contentsPage);
				doc.y=80;
		   	}
		})
	}
	
	saveHeader(){
		this.headers[this.pageNum]=this.currentTitle;
		//console.log('this.headers', this.headers, )
	}
	
	addNewPage(doc){
	   	this.saveHeader();
	}
	
	writeFooter(doc, pageNum, startPagingPage, footerData){
		doc
			.font(this.fonts.regular)
			.fontSize(9)
			.fill('black')
			.text(pageNum, this.textIdents.left, 750, {
				width: this.textWidth,
				continued: false,
				align: 'center'
			});
		if (footerData){
			doc
			  .font(this.fonts.regular)
			  .fontSize(8)

			  .text(footerData.leftText, this.textIdents.left, 730);
		}
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
		this.currentTitle=null;
	
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
					width: this.textWidth,
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
		  if (i+1 > this.startPagingPage && i!==this.contentsPage-1){
		  	this.writeFooter(doc, i+1-this.startPagingPage, this.startPagingPage, this.footers[i+1]);
		  }
		}
		  
		if (this.contentsPage && this.contents.length){
			doc.switchToPage(this.contentsPage-1);
			//drawActions.contents(doc);
			this.writeContents(doc);		
			
		}
	
		doc.end();
		//console.log(this.headers);
	}

}

module.exports = PDFUtils;