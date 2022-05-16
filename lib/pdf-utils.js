const PdfTable = require('./voilab-table');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const _ = require('lodash');
const {
		decodeHtml,
		asyncForEach,
		imageInfo,
		getImgPropheight,
		cleanUpHTML,
		parseHtml,
		getImgPropWidth
	} = require('./utils');
const blankImg= __dirname+'/../images/blank-image.jpg';

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
		this.pdfGenIterator=0;
		this.noImageMode=true;
		this.headerTextStyles={
			h1: {
				fontSize: 17,
				font: fonts.regular,
				color: 'black',
				startOnNewPage: true,
				dontChangeCurrentTitle: false,
				paddingBottom: 0.5,
				startOnRightSide: false
			}
		};
		
		this.drawActions={
			pageBreak: (doc, item)=>{
				if (item.headerTitle){
					this.currentTitle=item.headerTitle;
				}
				doc.addPage();
			},
			h1: (doc, item)=>{
				const styles=_.extend(_.clone(this.headerTextStyles.h1), item);
				//console.log(this.headerTextStyles.h1);
				if (styles.startOnRightSide && this.isRightPage()){
					this.currentTitle=null;
					doc.addPage();
				}
				if (!styles.dontChangeCurrentTitle || item.headerTitle){
					this.currentTitle=item.headerTitle || this.headerTitles.find(t=>t.titleRight===item.value);
				}				
				let y=textIdents.top;
				let x=textIdents.left;
				if (styles.leftIdent){
					x=styles.leftIdent;
				}
				if (styles.noHeader){
					this.currentTitle=null;
					y=30;
				}
				if (styles.topIdent){
					y=styles.topIdent;
				}
				if (styles.startOnNewPage/* && doc.y>100*/){
					doc.addPage();
				}
				else {
					if (doc.y>85){
						doc.moveDown(styles.marginTop || '0.7');
					}
					if (doc.y>660){
						doc.addPage();
					}
					
					y=doc.y;
				}
				
				if (item.value){
					item.startPageNum=this.pageNum;
					doc
					  .font(fonts.regular)
					  .fontSize(styles.fontSize)
					  .fill(styles.color)
					  .text(styles.value, x, y, {
					  	width: styles.width || this.textWidth,
					  	align: styles.align || 'left'
					  });
					doc.moveDown(styles.paddingBottom);
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
				if (doc.y>95){
					doc.moveDown(item.moveDown || 1);
				}
				const leftTextIdent=item.leftTextIdent || textIdents.left
			
				const y=doc.y;
				item.startPageNum=this.pageNum;
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
			
				doc.moveDown(item.marginBottom || 0.2);
				doc
					.font(fonts.regular)
					.fontSize(10)
					.fill('black')
			},
			h3: (doc, item)=>{
				if (doc.y>686){
					//doc.addPage();
				}
				if (doc.y>100){
					doc.moveDown(item.marginTop || 0);
				}
				
				item.startPageNum=this.pageNum;
				doc
				  .font(item.font || fonts.bold)
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
			lessonPlanHeader: (doc, {value, rightText, headerTitle, planIndex, moveDownAfter, addTopLine, addBottomLine})=>{
				const fonts=this.fonts;
				const textIdents=this.textIdents;
				//console.log('lessonPlanHeader', planIndex);
				
				
				if (headerTitle){
					this.currentTitle=headerTitle;
					doc.addPage();
				}
				const totalTimeAtTheEndOfThePage=doc.y>660 && planIndex>100 && doc.y<720;
			
				if (doc.y>660 && !totalTimeAtTheEndOfThePage){
					doc.addPage();
				}
				
				if (addTopLine){
					this.drawActions.line(doc, {
						showOnTopOfThePage: true,
					});
				}
				
				if (doc.y>200 && planIndex>0 && planIndex<100){
					doc.moveDown(0.5);
				}
				
				
			
				const y=doc.y;
				doc
				  .font(fonts.semiBold)
				  .fontSize(12)
				  .fill('black')
				  .text(value, textIdents.left, y, {
					width: 350,
					continued: false,
					lineBreak: true,
				  });
				const afterTextY=doc.y;
				doc
				  .font(fonts.semiBold)
				  .fontSize(12)
				  .text(rightText, 70, y, {
					width: 470,
					align: 'right'
				  });
				doc.y=afterTextY;
			  	
			  	if (!totalTimeAtTheEndOfThePage){
			  		doc.moveDown(moveDownAfter || 0.2);
			  	}
				
				doc
					.font(fonts.regular)
					.fontSize(10)
					.fill('black')
					
				if (addBottomLine){
					this.drawActions.line(doc, {
						//showOnTopOfThePage: true,
					});
				}
			},
			p: (doc, item)=>{
				const params=item.params || {};
				const ulLevel=item.ulLevel || 0;
				let level=item.level || 0;
				let ident=params.ident || 0;
				let width=params.width || this.textWidth;
				let moveDown=params.moveDown || 0;
				let marginTop=params.marginTop || 0;
				let addSpaceAfter=params.addSpaceAfter!==undefined ? params.addSpaceAfter : true;
				let addSpaceAfterSize=params.addSpaceAfterSize || 10;
				let brFontSize=params.brFontSize || 10;
				let imagesAfter=[];
				let lastTag;
				const bulletParams=item.bulletParams;
				const leftTextIdent=params.leftTextIdent || textIdents.left;
				if (params.topTextIdent){
					doc.y=params.topTextIdent;
				}
				if (marginTop){
					doc.moveDown(marginTop);
				}
				const startX=doc.x;
				const startY=doc.y;
				if (item.isHtml){
					let parentTagName='';
					let parentClass='';				
					if (item.parentEl && item.parentEl.getAttribute){
						parentTagName=item.parentEl.tagName;
						parentClass=item.parentEl.getAttribute('class') || '';
					}
					//console.log(parentTagName);
					
					if (doc.y>735 && level===0){
						doc.addPage();
					}
					const convertHTMLString=(str)=>{
						//console.log('convertHTMLString', _.keys( params), str)
						if (item.params && item.params.replaceFn){
							const res=item.params.replaceFn(str, item.params);
							//console.log('res', res);
							if (_.isString(res)){
								str=res;
							}
							else {
								str=res.string;
								if (!params.dontShowImagesAfter){
									res.images.forEach(image=>imagesAfter.push(_.clone(image)));
								}
							}
							
						}
						return this.convertHtml(str);
					}
					item.value.forEach((node, index)=>{
						if (node.tagName !=='li'){
							node.convertedText=convertHTMLString(node.text);
						}
						
					});
					const textHeight=doc.heightOfString((item.value || []).map(n=>n.convertedText).join(''), {
						width: this.textWidth,
					});
					if (imagesAfter && imagesAfter.length && imagesAfter[0].firstRowHeight){
						item.blockHeight=textHeight+imagesAfter[0].firstRowHeight;
						if (textHeight+imagesAfter[0].firstRowHeight+doc.y>750){
							doc.addPage();
						}
					}
					else {
						item.blockHeight=textHeight;
					}
			
					if (bulletParams){
						if (doc.y > 732){
							doc.addPage();
						}
						if (bulletParams.style==='fill'){
							doc.circle(leftTextIdent+ident-12+(params.listsIdent || 0), doc.y+8, 2)	
								.fill("black");
						}
						if (bulletParams.style==='stroke' && ulLevel!==1){
							doc.circle(leftTextIdent+ident-12+(params.listsIdent || 0), doc.y+8, 2)	
								.strokeColor('black')
								.stroke();
						}
					}
				
					const tagFonts={
						em: fonts.italic,
						b: fonts.bold,
						strong: fonts.bold,
						semiBold: fonts.semiBold,
						symbol: fonts.arial
					}
					const tagFeatures={
						sup: ['sups'],
						sub: ['subs'],
					}
					item.startPage=this.pageNum;
					if (parentTagName === 'tips-box' && parentClass.indexOf('tips-box') >=0) {
						doc.x=this.textIdents.left;
						item.blockHeight+=60;
						const boxColors={
							sep: ['#b8cce4', '#0066b3'],
							ccc: ['#DAE2CA', '#7DA953']
						}
						const boxType=parentClass.indexOf('sep') > 0 ? 'sep' : 'ccc';
						ident=12;
						moveDown=0.2;
						const boxH=doc
							.font(fonts.regular)
						  	.fontSize(10).heightOfString(item.value.map(n=>n.text).filter(txt=>txt && txt!=='\n').join('\n'), {
							width: this.textWidth-(ident*2),
							//continued: false
						})+(ident*2)+20;
						if (boxH+doc.y>747){
							doc.addPage();
							//doc.y+=ident;
						}
						doc.y+=15;
						//console.log('tipsbox', item.value.map(n=>n.toString()), item.value.map(n=>n.text));
					
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
					item.startPageNum=this.pageNum;
					item.value.forEach((node, index)=>{
						const prevNode=item.value[index-1];
						//console.log('tagName', node.tagName, parentTagName, parentClass);
						//console.log(node.text);
						/*
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
						
						else */ if ((parentTagName ==='ul' || parentTagName ==='ol') && node.tagName ==='li'/* && params.processListsAsBlocks*/){	
							const liIdent=15;
							const firstIdent=7;
							if (params.ulMarginTop===undefined){
								params.ulMarginTop=6;
							}
							if (node.rawText!=='\n'){
								//console.log('node.toString()', index, node.toString());
								
								if (index==0 && params.ulMarginTop){
									doc.y+=params.ulMarginTop;
								}
								
								if (doc.y>725 && index==0){
									doc.addPage();
								}
								
								//console.log(parentTagName, node.tagName, node.rawText);
								if (index>0 && index<item.value.length){
									doc
									.lineGap(0.4)
									.fontSize(7)
									.text(' ', {
										width,
										continued: false
									});
								}
								
								doc.x=leftTextIdent+ident;
								const bulletStyles=['fill', 'stroke', 'fill'];
								
								const liHeight=doc
									.fontSize(params.fontSize || this.defaultFontSize)
									.heightOfString(node.text, {									
										width: width-(liIdent)-(params.listsIdent || 0),
									});
								
								
								if (liHeight+doc.y > 749 && liHeight+doc.y < 770 && liHeight>13 && level===0){
									//console.log('liHeight+doc.y', liHeight+doc.y);
									doc.addPage();
								}

								const ulChild=node.querySelector('ul');
								let innerAddSpaceAfterSize=4
								if (index===item.value.length-1){
									innerAddSpaceAfterSize=0.01;
								}
								
								if (doc.y > 710 && ulChild){
									doc.addPage();
								}
								if (doc.y > 710 && parseInt(liHeight)===25){//2 lines
									doc.addPage();
								}
								if (doc.y > 710 && liHeight>26){//1+n lines
									doc.addPage();
								}
								//console.log('liHeight', liHeight, liHeight+doc.y, node.text);
								
			
								this.drawActions.p(doc, {
									value: node.childNodes.filter(n=>n.tagName!=='ul'),
									isHtml: true,
									parentEl: node,
									bulletParams: {style: bulletStyles[ulLevel]},
									params: {
										ident:liIdent+ident+firstIdent+(params.listsIdent || 0),
										width: width-(liIdent)-(params.listsIdent || 0)-firstIdent,
										leftTextIdent: leftTextIdent,
										lineGap: params.lineGap,
										addSpaceAfterSize: ulChild ? 5 : (innerAddSpaceAfterSize || 8),
										processListsAsBlocks: true,
										parentEl: node,
										replaceFn: params.replaceFn,
										bulletParams: {},
										moveDown: ulChild ? 0.0000003 : 0,
									},
									//level: level+1
								});
								if (ulChild){
									this.drawActions.p(doc, {
										value: ulChild.childNodes,
										isHtml: true,
										parentEl: ulChild,
										ulLevel: ulLevel+1,
										bulletParams: {style: bulletStyles[ulLevel+1]},
										params: {
											ident:liIdent+(params.childUlIdent || 0)+ident+(params.listsIdent || 0),
											width: width-(liIdent)-(params.listsIdent || 0),
											leftTextIdent: leftTextIdent,
											lineGap: params.lineGap,
											addSpaceAfterSize: params.childUlAddSpaceAfterSize || 3,
											processListsAsBlocks: true,
										}
									});
								}
								
								lastTag='li';
								if (index==item.value.length-1 && params.ulMarginTop){
									doc.y+=params.ulMarginTop;
								}
								//addSpaceAfter=true;		
								//addSpaceAfterSize=(addSpaceAfterSize || 8);						
							}
							doc.x=leftTextIdent;							
						}
						else if (parentTagName === 'tips-box'){	
							if (node.rawText!=='\n'){
								//console.log(node.childNodes);
								this.drawActions.p(doc, {
									value: node.childNodes.length ? node.childNodes : [node],
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
							let str=node.convertedText;						
							//console.log(node);
							//console.log(doc.x, doc.y);
							//console.log(doc.prevPage, pageNum, doc.prevY);
							const processNode=(node, styles)=>{
								if (!styles){
									styles={};
								}
								
								const setStyles=(node)=>{
									(node.getAttribute && node.getAttribute('style') ? node.getAttribute('style').split(';') : []).map(item=>{
										const arr=item.split(':');
										if (arr && arr.length>1){
											styles[arr[0].trim()]=arr[1].trim();
										}
									});
								}
								if (item.parentEl){
									setStyles(item.parentEl);
								}
								setStyles(node);
								
								//console.log('styles', styles);
								if (node.childNodes && node.childNodes[0] && node.childNodes[0].tagName==='strong' && node.childNodes.length<=2){
									node.tagName='strong';
								}
								if (node.tagName==='strong' && node.childNodes && node.childNodes[0]?.tagName==='span' && node.childNodes.length<2){
									setStyles(node.childNodes[0])
								}
								if (parentClass && parentClass.indexOf('bold-text') >=0) {
									node.tagName='semiBold';
								}						
								if (node.tagName==='br'){
									//doc.moveDown(0.2);
									doc.fontSize(brFontSize).fillColor('black').text(' ', leftTextIdent, doc.y, {
										width,
										continued: false
								   });
								}

								//console.log(node.structure.length);
								
								if (node.childNodes && node.childNodes.length>2){
									/*
									this.drawActions.p(doc, {
										value: node.childNodes.filter(n=>n.nodeType==1),
										isHtml: true,
										parentEl: node,
										params: _.extend(params, {
											ident:ident,
											width: this.textWidth-(ident*2),
										})
									});
									return;
									*/
									
									//node.childNodes.forEach(n=>processNode(n, styles));
									//return;
								}
								//console.log(styles);
								//console.log('str', str);
								doc.fillColor(styles.color || 'black')
									.font(tagFonts[node.tagName] || fonts.regular)
									.lineGap(params.lineGap || 1.2)
									.fontSize(params.fontSize || this.defaultFontSize)
							   .text(str/*.trimStart()*/, leftTextIdent+(ident || 0), doc.y, {
									width,
									continued: true,
									lineBreak: true,
									align: /*styles['text-align'] || */'left',
									//wordSpacing: 0.1,
									features: tagFeatures[node.tagName] || [],
							   });
							   doc.prevX=doc.x;
							   doc.prevY=doc.y;
							   //console.log('doc.prevX', doc.prevX);
							   doc.prevPage=this.pageNum;
							   if (level===0){
							   	lastTag='p';
							   }
							   
							};
							
						   //console.log(node.tagName, tagFeatures[node.tagName]);
						   processNode(node, {});
						}
						
						
					
					});
				}
				else {
					doc.moveDown(0.5);
					doc.fillColor('black')
						.font(params.font || fonts.regular)
						.lineGap(1.6)
						.fontSize(this.defaultFontSize)
				   .text(item.value, leftTextIdent+(item.ident || 0), doc.y,{
						width,
						continued: true
				   });
				}
				let afterTextY=doc.y;
				if (level===0){
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
					else {
						doc
						.text(' ', {
							width,
							continued: false
						});
					}
				}
				
				if (params.image && params.image.width){
					//console.log(params.image);
					doc.image(params.image.value, params.image.x, startY+params.image.marginTop, {width: params.image.width});
				}
				
				/*
				if (params.border){
					node /home/ec2-user/pptx2pdf/cli.js "/home/ec2-user/GNpublishing/lib/../tmp/e-storm-of-the-century-phenomenon.pdf" --png --output-dir="/home/ec2-user/GNpublishing/public/e-storm-of-the-century-phenomenon" --resize=2400 --density=600
					doc.rect(startX, startY, width, doc.y).stroke();
				}
				*/
				if (imagesAfter && imagesAfter.length){
					let pdfPreviews=[];
					imagesAfter.forEach(item=>{
						if (item.type==='images'){
							item.value.forEach(val=>{
								pdfPreviews.push(val);
							})
						}
					})
					const firstImgsItem=imagesAfter.find(item=>item.type==='images');
					if (firstImgsItem){
						firstImgsItem.value=pdfPreviews;
						firstImgsItem.collected=true;
						let imgX=this.textIdents.left;
						if (pdfPreviews.length === 1){
							imgX+=155;
						}
						if (pdfPreviews.length === 2){
							imgX+=77;
						}
						pdfPreviews.forEach(img=>{
							img.x=imgX;
							imgX+=img.width;
							if (imgX>450){
								imgX=textIdents.left;
							}
						})
						
					}
					//console.log('pdfPreviews', pdfPreviews.length, firstImgsItem);
					
					//console.log('lastTag', doc.y-afterTextY);
					if (doc.y > afterTextY && doc.y-afterTextY<5){
						doc
						.text(' ', {
							width,
							continued: false
						});
						doc.moveDown(0.5);
					}
					else {
						doc.moveDown(0.5);
					}
					
					imagesAfter.filter(item=>item && item.type && (item.type!=='images' || (item.type==='images' && item.collected))).forEach(item=>{
						//console.log('drawActions', item.type, item);
						this.drawActions[item.type](doc, item);
					})
					
				}
		
				item.endPage=this.pageNum;
				if (moveDown){
					doc.moveDown(moveDown);
				}
				doc.x=textIdents.left;
		   
			},
			image:(doc, item)=>{
				if (!item.value){
					console.log('Undefined image item:', item);
					return;
				}
				const prevX=doc.x;
				const prevY=doc.y;
				if (doc.y+item.height>840){
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
				if (item.value.indexOf('.gif')<0){
					doc.image(this.noImageMode ? blankImg : item.value, item.x || doc.x, doc.y, {width: item.width || this.textWidth, height: item.height || undefined});
				}
				
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
				doc.moveDown(0.2);
				if (doc.y+item.value[0].height>740){
					doc.addPage();
				}
				let y=doc.y;
				let maxY=y;
				let colsNum=parseInt(465/item.value[0].width);
				let highlightBorders=[];
				
				const addHighLights=()=>{
					highlightBorders.forEach(vals=>{
						doc.rect(...vals)
							.lineWidth(2)
							.strokeColor(vals[4])
							.stroke();
						if (vals[5]){
							doc.image(vals[5], vals[0]+vals[2]-15, vals[1]-15, {
								width: 30,
							});
						}
						highlightBorders=[];
					})
				}
				item.height=item.value[0].height;
				
				item.value.forEach((image, index)=>{
					if (doc.y+image.height>757 && image.x<textIdents.left+40){
						addHighLights();
						doc.addPage();
						y=doc.y;
						maxY=y;
					}
					else if (!image.x || image.x<textIdents.left+40/* || (index+1)%colsNum===0*/) {
						//doc.moveDown(0.5);
						y=doc.y;
					}
					if (image.x && image.x > textIdents.left+40){
						doc.y=y;
					}
					doc.x=image.x;				
					//console.log(doc.x, doc.y, y, image.x);
					const imgX = doc.x;
					const imgY = doc.y;
					//console.log(image);
					doc.image(this.noImageMode ? blankImg : image.path, {width: image.width || this.textWidth, height: image.height || undefined});
					if (doc.y>maxY){
						maxY=doc.y;
					}
					
					const strokeParams={
						width:1,
						color:'black'
					}
					if (image.highlight){
						strokeParams.width=2;
						strokeParams.color=image.highlight.color;
						highlightBorders.push([imgX, imgY, image.width, image.height, image.highlight.color, image.highlight.icon]);
					}
					if (item.addBorder){
						doc.rect(imgX, imgY, image.width, image.height)
							.lineWidth(strokeParams.width)
							.strokeColor(strokeParams.color)
							.stroke();
					}
					
					
				})
				addHighLights();
				
				doc.x=textIdents.left;
				if (maxY>doc.y){
					doc.y=maxY+5;
				}
				//console.log(doc.x, doc.y);
				//console.log(item);
				doc.moveDown(0.5);
			},
			table: (doc, item)=>{
				let {columns, data, fontSize, hideHeaders, borderColor, headerColor, leftIdent, padding}=item;
				if (!padding){
					padding=4;
				}
				//console.log({columns, data});
				if (leftIdent){
					doc.x=leftIdent;
				}
				const prevY=doc.y;
				let table = new PdfTable(doc, {
					bottomMargin: 20,
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
						headerPadding: [padding,padding,padding,padding],
						padding: [padding,padding,padding,padding],
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
				table.addBody(item.dataFilter ? item.dataFilter(data) : data);
			
				doc.text(' ', textIdents.left, doc.y, {
					width: this.textWidth,
					continued: false
				});
				item.height=doc.y-prevY;
			
				//doc.moveDown(0.2);
			},
			setStartPagingPage: ()=>{
				if (!this.startPagingPage){
					this.startPagingPage=this.pageNum-1;
				}
			},
			sectionCover: (doc, params)=>{
				this.writeSectionCover(doc, params);
			},
			list: (doc, {value, ident, notMoveDownAfter, html, childUlIdent, ulMarginTop, childUlAddSpaceAfterSize})=>{
				if (!html){
					html='<ul>';
					value.forEach(str=>{
						html+='<li>'+str+'</li>';
					});
					html+='</ul>';
				}
				
				//console.log('List: ', html);
				
				const root=parseHtml(html).childNodes[0];

				this.drawActions.p(doc, {
					value: root.childNodes,
					parentEl: root,
					isHtml:true,
					params: {
						addSpaceAfterSize: 3,
						moveDown: notMoveDownAfter ? 0.01 : undefined,
						childUlIdent,
						ulMarginTop,
						childUlAddSpaceAfterSize
					}
				})
				/*
				doc.fillColor('black')
					.font(fonts.regular)
					.list(value, textIdents.left+(ident || 0), doc.y, {
						bulletIndent: 50,
						//textIndent: 20,
						bulletRadius:2.5,
					});	
				*/
				if (!notMoveDownAfter){
					doc.text(' ', textIdents.left, doc.y, {
						width: this.textWidth,
						continued: false
					});
				}
				
			},
			line: (doc, {leftIdent, width, showOnTopOfThePage}) => {
				if ((doc.y>85 || showOnTopOfThePage) && doc.y<740){
					doc.moveDown(0.4);
					doc.lineWidth(0.7)
						.strokeColor('#999')
					   	.moveTo(leftIdent || 55, doc.y)
					   	.lineTo(width || 550, doc.y)
					   	.stroke();
					doc.moveDown(0.4);
				}
			},
			lineBreak: (doc, {}) => {
				doc.moveDown(0.4);
			},
			pptSlide: (doc, item) =>{
				const {value, imgInfo, file, highlight, hideLabels}=item;
				const width=170;
				const height=getImgPropheight(imgInfo, width);
				const text=value.text && value.text.trim() ? '<p>Notes<br/></p>'+value.text.trim() : '';
				const textOptions={
					width: this.textWidth-(width+15),
					continued: false
				};
			
				const textHeight=doc
					.fontSize(this.defaultFontSize)
					.heightOfString(text, textOptions);
				const maxHeight=textHeight > height ? textHeight : height;
				item.height=maxHeight;
			
				if (doc.y+(maxHeight+40)>745){
					doc.addPage();
				}
				else {
					doc.moveDown(0.5);
				}
				const startPage=this.pageNum;
				if (file && value.slideNum===1){
					file.pageNum=this.pageNum-this.startPagingPage;
					if (!file.isOnline){
						file.page='Page '+file.pageNum+' (Visual Reference)';	
					}
					file.inlinePageRef='online access';	
				}
				if (!hideLabels){
					doc.fillColor('black')
						.font(fonts.bold)
						.lineGap(1.6)
						.fontSize(10)
					.text('Slide '+value.slideNum, textIdents.left, doc.y, {
						width: this.textWidth,
						continued: false
					});
				}
				
			
				const y=doc.y;
			
				const imgX = textIdents.left;
				const imgY = doc.y;
				doc.image(this.noImageMode ? blankImg : value.imagePath, imgX, imgY, {width: width, height});
				const strokeParams={
					width:1,
					color:'black'
				}
				if (highlight){
					strokeParams.width=2;
					strokeParams.color=highlight.color;
				}
				doc.rect(imgX, imgY, width, height)
					.lineWidth(strokeParams.width)
					.strokeColor(strokeParams.color)
					.stroke();
				if (highlight && highlight.icon){
					doc.image(highlight.icon, imgX+width-15, imgY-15, {
						width: 30,
					});
				}
			
				const yAfterImage=doc.y;
				
				if (!hideLabels){
					
					const root=parseHtml(text);
					doc.y=y;
					root.childNodes.forEach(node=>{
						this.drawActions.p(doc, {
							value: node.childNodes,
							parentEl: node,
							isHtml:true,
							params: {
								//addSpaceAfterSize: 3,
								ident: width+15,
								width: textOptions.width,
							}
						})
					})
					
					/*
					doc.fillColor('black')
						.font(fonts.regular)
						.lineGap(0.6)
						.fontSize(10)
					.text(text, textIdents.left+width+15, y, textOptions);
					*/
					
				}
				
				doc.x=textIdents.left;
				doc.y=yAfterImage > doc.y && startPage===this.pageNum ? yAfterImage : doc.y 
			
				doc.moveDown(0.6);
			},
			introductions: (doc, {value, imgInfo, data, color, titleFont, fontSize, leftIdent, paddingBottom, moveDown}) =>{
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
				if (moveDown || moveDown===undefined){
					doc.moveDown(moveDown || 1);
				}
				
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
				let firstPageNum;
				value.forEach((image, index)=>{
					if (headerParams){
						this.currentTitle=headerParams;
					}
					doc.addPage();
					if (!firstPageNum){
						firstPageNum=this.pageNum;
					}
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
					//console.log(image);
					doc.image(this.noImageMode ? blankImg : image.path, {
						width: width || 612,
						height: 792,
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
				const currentPageNum=firstPageNum-this.startPagingPage;
				this.wrongPageReferencing=file.pageNum && file.pageNum!==currentPageNum;
				if (this.wrongPageReferencing){
					//console.log('wrongPageReferencingDesc', file.pageNum, currentPageNum);
				}
				
				if (this.setFilePages){
					file.pageNum=currentPageNum;
					file.page='Page '+file.pageNum;
					file.inlinePageRef='page '+file.pageNum;	
				}
				
				//console.log(file);
			},
			setFooter: (doc, params)=>{
				this.footers[this.pageNum]=params;
			},
			setY: (doc, {value})=>{
				doc.y=value;
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
		
		const textOptions={
		
		};

		const titleLeftHeight=doc
			.fontSize(14)
			.font(this.fonts.semiBold)
			.heightOfString(header.titleLeft, {
				width: 510,
				continued: false
			});
		
		doc
		  .moveTo(60, 30)
		  .font(this.fonts.semiBold)
		  .fontSize(14)
		  .fill(header.textColor || 'black')
		  .text(header.titleLeft, 38, 30-(titleLeftHeight > 20 ? 13 : 0));
	  
		doc
		  .font(this.fonts.semiBold)
		  .fontSize(14)
		  .fill(header.textColor || 'black')
		  .text(header.titleRight, 70, 30, {
		  	width: 460,
		  	align: 'right'
		  });
	  
	
		doc
		.image(header.icon, 543, 15, {
		  width: 35,
		  align: 'center',
		  valign: 'center'
		});
		
		//doc.text(pageNum, textIdents.left, 600) 
	  
		doc
		  .save()
		  .moveTo(38, 55)
		  //.lineTo(50, 40)
		  .lineTo(578, 55)
		  .lineTo(578, 57)
		  .lineTo(38, 57)
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
		  .text(s.title.text || 'Table of Contents', s.title.idents[0], s.title.idents[1], {
			width: s.width,
			align: 'left',
			continued: false
		  });
		this.drawActions.line(doc, _.extend(s.lineParams || {}, {showOnTopOfThePage: true}));
		
		doc.moveDown(0.2);
		const leftIdent=s.leftIdent || this.textIdents.left;
		
		this.contents.forEach(item=>{
			const y=doc.y;
			let lineStart;
			let lineY=doc.y+11;
			//console.log(item);
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
					this.drawCircleDotsLine(doc, lineStart, lineY, (s.width+55)-((item.pageNum+'').length*4)-lineStart, 0.5, item.color);
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
				if(item.title.length > 100){
					var trimmedString = item.title.substr(0, 100);
					item.title = trimmedString.substr(0, Math.min(trimmedString.length, trimmedString.lastIndexOf(" ")))
				}
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
				let strHeight=parseInt(doc.heightOfString(item.title, {
					width: s.width-5,
					font: s.level1.font,
					fontSize: s.level1.fontSize
				}));
				doc
				  .font(s.level1.font)
				  .fontSize(s.level1.fontSize)
				  .text(item.pageNum, 70, y, {
					width: s.width-5,
					//lineGap: 1,
					align: 'right'
				  });
				/*
				console.log(strHeight, item.title);
				lineY+=strHeight-12;
				if (strHeight>12){
					lineStart=doc.x;
				}*/
				this.drawCircleDotsLine(doc, lineStart, lineY-2, (s.width+55)-((item.pageNum+'').length*3)-lineStart, 0.5, item.color || 'black');
				//doc.y=lineY+2;
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
				doc.y=50;
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
		const currentHeader=this.headers[pageNum+startPagingPage];
		const lineY=753;
		const lineWidth=2;
		const contentWidth=540;
		const textIdents={
			left: 48,
			top: 85
		}
		const hideLine=footerData && footerData.hideLine;
		
		
		if (pageNum%2===0){
			doc
			.font(this.fonts.regular)
			.fontSize(12)
			.fill('black')
			.text(pageNum, textIdents.left-10, lineY-7, {
				width: 465,
				continued: false,
				align: 'left'
			});
			
			if(!hideLine && currentHeader){
				doc
				  .save()
				  .moveTo(textIdents.left+16, lineY)
				  //.lineTo(50, 40)
				  .lineTo(contentWidth+textIdents.left-10, lineY)
				  .lineTo(contentWidth+textIdents.left-10, lineY+lineWidth)
				  .lineTo(textIdents.left+16, lineY+lineWidth)
				  .fill(currentHeader.color || this.colors.unitTitle);	
			 
				doc
				.font(this.fonts.arial)
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
			.font(this.fonts.regular)
			.fontSize(12)
			.fill('black')
			.text(pageNum, textIdents.left-10, lineY-7, {
				width: contentWidth,
				continued: false,
				align: 'right'
			});
			
			if(!hideLine && currentHeader){
				doc
				  .save()
				  .moveTo(textIdents.left-10, lineY)
				  //.lineTo(50, 40)
				  .lineTo(contentWidth+textIdents.left-35, lineY)
				  .lineTo(contentWidth+textIdents.left-35, lineY+lineWidth)
				  .lineTo(textIdents.left-10, lineY+lineWidth)
				  .fill(currentHeader.color || this.colors.unitTitle);	
			 
				doc
				.font(this.fonts.arial)
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
			  .font(this.fonts.regular)
			  .fontSize(8)
			  .lineGap(-0.5)
			  .text(footerData.leftText || footerData.centerText, textIdents.left+50, lineY+8, {
			  	width: contentWidth-100,
				continued: false,
				align: 'center'
			  });
		}
	}

	
	generatePdf(pdfFileName, blocks, setFilePages, noImageMode){
		this.setFilePages=setFilePages===undefined ? true : setFilePages;
		const doc = new PDFDocument({
			bufferPages: true,
			autoFirstPage: false ,
			margins: {
				top: this.textIdents.top,
				bottom: 47,
				left: this.textIdents.left,
				right: 70
			}
		});

		this.noImageMode=pdfFileName==='temp.pdf' || noImageMode;
	
		this.pageNum=0;
		this.headers={};
		this.footers={};
		this.contents=[];
		this.currentTitle=null;
		this.showedFiles=[];
	
		doc.pipe(fs.createWriteStream(pdfFileName));
	
		doc.on('pageAdded', () => {
			this.pageNum++;
			this.addNewPage(doc);
		});
	
		let currentH2;
		
		blocks.forEach((item, i)=>{
			if (item.type=='p' && blocks[i+1] && ['pageBreak', 'sectionCover'].indexOf(blocks[i+1].type)>=0 && item.startPage && item.endPage && item.startPage<item.endPage){
				item.lastParagraph=true;
				const needToMove=false;//item.startPage<item.endPage;
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
			if (item.type==='h1' && blocks[i+1] && blocks[i+1].type==='h1' && item.value==='Teaching Resources'){
				blocks=_.without(blocks, item);
			}
		});

		const between=(val, start, end)=> val>=start && val<=end;
		
		const pTextHeight=(item, addLineBreaks, nodes)=>{
			if (!item.textHeight){
				item.textHeight=0;
			}
			const extractText=(n, index)=>{
				if (n.childNodes?.length && ['p', 'li', 'ul'].indexOf(n.tagName)>=0){
					return n.childNodes.map((n, index)=>extractText(n, index)).join('')+'\n';
				}
				return (['p', 'li', 'ul'].indexOf(n.tagName)>=0 && index > 0 && addLineBreaks ? '\n' : '')+(n.convertedText || n.text);
			};
			const value=(_.isArray(item.value) ? item.value : null) || nodes || [];
			let text=value.map((n, index)=>{
				return extractText(n, index);
			}).join('');

			//console.log('pTextHeight', text);
			let textHeight=doc.fontSize(this.defaultFontSize).heightOfString(text, {
				fontSize: this.defaultFontSize,
				width: this.textWidth-(item.ident || 0),
			});	
			let lis=value.filter(n=>n.tagName==='li');
			textHeight+=lis.length*3;
			//console.log('lis.length', lis.length);

			if (textHeight > item.textHeight){
				item.textHeight=textHeight;
			}	
			return item.textHeight;
		};
		
		blocks.forEach((item, i)=>{
			let onAfterRender=[];
			if (item.type=='h1'){
				//console.log('h1', item.value+'('+blocks[i].startPageNum+')', blocks[i+1].type+'('+blocks[i+1].startPageNum+')');
			}
			if ((item.type=='h1' || item.type=='h2') && blocks[i+1] && ['p', 'h2', 'h3', 'h4'].indexOf(blocks[i+1].type)>=0 && item.startPageNum >0 && blocks[i+1].startPageNum && blocks[i+1].startPageNum === item.startPageNum+1){
				doc.addPage();
			}
			if ((item.type=='h1' && !item.startOnNewPage) || item.type=='h2' || item.type=='h3' || item.type=='h4'/* || item.type=='lessonPlanHeader'*/){
				currentH2=_.clone(item);
				
				if (currentH2.type==='h1'){
					currentH2.type='h2';
				}
				item.sectionHeight=doc.fontSize(this.headerTextStyles[item.type] ? this.headerTextStyles[item.type].fontSize : this.defaultFontSize).heightOfString(item.value, {
					//fontSize: this.defaultFontSize,
					width: this.textWidth,
				});
				doc.fontSize(this.defaultFontSize);
				
				let j=i+1;
				let pCounter=0;
				item.firstParagraphHeight=item.sectionHeight;
				while(blocks[j] && !blocks[j].isTitle && (
					(blocks[j].type==='p' && (blocks[j].isHtml || blocks[j].value))
					|| (blocks[j].type==='image' && blocks[j].height)
					|| (item.type==='h1' && blocks[j].type==='h2')
					|| (item.type==='h2' && blocks[j].type==='h3')
					|| (item.type==='h3' && blocks[j].type==='h4')
					|| (blocks[j].type==='lineBreak')
					|| (blocks[j].type==='list')
				)){
					//console.log('while(blocks[j]', j, item.sectionHeight, blocks[j]);
					if (blocks[j].type==='p'){
						item.sectionHeight+=pTextHeight(blocks[j], true, !blocks[j].isHtml && blocks[j].value ? [parseHtml(blocks[j].value)] : null);
						if (j>i+1){
							item.sectionHeight+=5;
						}
						pCounter++;
					}
					if (blocks[j].type==='list'){
						if (!blocks[j].html){
							(blocks[j].value || []).forEach(text=>{
								item.sectionHeight+=pTextHeight(blocks[j], true, [parseHtml(text)]);
							})
						}
						else {
							item.sectionHeight+=pTextHeight(blocks[j], true, parseHtml(blocks[j].html).childNodes);
							//console.log('pTextHeight(blocks[j], true)', pTextHeight(blocks[j], true, parseHtml(blocks[j].html).childNodes))
						}
					}
					if (blocks[j].type==='image'){
						item.sectionHeight+=blocks[j].height;
					}
					if (blocks[j].type==='h2'){
						item.sectionHeight+=15;
						pCounter++;
					}
					if (blocks[j].type==='h3'){
						item.sectionHeight+=7;
						pCounter++;
					}
					if (blocks[j].type==='lineBreak'){
						item.sectionHeight+=5;
					}
					if (pCounter<2){
						item.firstParagraphHeight=item.sectionHeight;
					}
					item.pCounter=pCounter;
					j++;
				}
				if (item.value==='Connections to Other NGSS Standards'){
					console.log('Section Size start', item.value, item.sectionHeight, doc.y, doc.y+item.sectionHeight, blocks[i-1],item, blocks[i+1], blocks[i+2], blocks[i+3], blocks[i+4], pCounter);
				}
				if (blocks[j-1]){
					item.lastElType=blocks[j-1].type;
				}
				if (blocks[j]){
					item.nextSectionElType=blocks[j].type;
					item.nextSectionEl=blocks[j];
				}
				if ((item.nextSectionElType==='sectionCover' || (item.nextSectionElType==='h1' && item.nextSectionEl.startOnRightSide)) && doc.y+item.sectionHeight>740){
					item.movingToNextPage=true;
					doc.addPage();
				}
				else if (doc.y+item.sectionHeight>730 && item.sectionHeight<400 && doc.y<720 && !item.startOnRightSide){
					item.movingToNextPage=true;
					doc.addPage();
				}
				else if (doc.y+item.sectionHeight>720 && item.sectionHeight<610 && doc.y<720 && !item.startOnRightSide && (item.moveToNextPageIfNotFit || item.lastElType=='image')){
					item.movingToNextPage=true;
					doc.addPage();
				}
				else if (item.firstParagraphHeight>200 && doc.y+item.firstParagraphHeight > 730 && item.firstParagraphHeight<600 && doc.y>400 && !item.startOnRightSide && item.firstParagraphHeight<500){
					item.movingToNextPage=true;
					doc.addPage();
				}
				else if (item.firstParagraphHeight>200 && doc.y+item.firstParagraphHeight > 730 && item.firstParagraphHeight<600 && doc.y>400 && !item.startOnRightSide && item.firstParagraphHeight<500){
					item.movingToNextPage=true;
					doc.addPage();
				}
				else if (blocks[i+1] && blocks[i+1].movingToNextPage){
					doc.addPage();
				}
				if (item.value==='Connections to Other NGSS Standards'){
					console.log('Section Size end', item.value, item.sectionHeight, doc.y, doc.y+item.sectionHeight, blocks[i-1],item, blocks[i+1], blocks[i+2], blocks[i+3], blocks[i+4], pCounter);
				}
				
				//console.log('item.sectionHeight', item.sectionHeight, item.value);
			}
			
			if (item.type=='lessonPlanHeader'){
				
				item.sectionHeight=20;
				item.hasImages=false;
				doc.fontSize(this.defaultFontSize);
				
				let j=i+1;
				let pCounter=0;
				while(blocks[j] && ['p','image','images', 'pptSlide', 'lessonPlanHeader'].indexOf(blocks[j].type)>=0){
					if (blocks[j].type==='lessonPlanHeader'){
						if (!blocks[j].isTotalTile){
							break;
						}
						else {
							item.sectionHeight+=30;
							item.lastSection=true;
						}
						
					}
					if (blocks[j].type==='p'){
						const texth=pTextHeight(blocks[j], true);
						item.sectionHeight+=blocks[j].blockHeight && blocks[j].blockHeight > texth ? blocks[j].blockHeight : texth;
						if (j>i+1){
							item.sectionHeight+=5;
						}
						pCounter++;
					}
					else {
						item.hasImages=true;
					}
					
					if (blocks[j].height && (blocks[j].type==='image' || blocks[j].type==='images' || blocks[j].type==='pptSlide')){
						item.sectionHeight+=blocks[j].height;
						//console.log(blocks[j].type, blocks[j].height);
					}
					if (pCounter<2){
						item.firstParagraphHeight=item.sectionHeight;
					}
					//console.log('lessonPlanHeader blocks[j].type', blocks[j].type, blocks[j].height, blocks[j].blockHeight, item.sectionHeight);
					j++;
				}
				//console.log('Plan Section Size', item.value, item.sectionHeight, doc.y, doc.y+item.sectionHeight, doc.y+item.firstParagraphHeight,item, blocks[i+1], blocks[i+2], blocks[i+3], blocks[i+4], pCounter, blocks[j-1].type, blocks[j].type);

				if (doc.y+item.sectionHeight>730 && item.sectionHeight<400 && (!item.hasImages || item.lastSection) && item.planIndex>0){
					item.movingToNextPage=true;
					doc.addPage();
				}
				if (item.firstParagraphHeight>200 && doc.y+item.firstParagraphHeight > 715 && item.firstParagraphHeight<600 && doc.y>400){
					item.movingToNextPage=true;
					doc.addPage();
				}
				//console.log('lessonPlanHeaderHeight', item.value, item.sectionHeight, item.firstParagraphHeight, doc.y+item.sectionHeight, doc.y+item.firstParagraphHeight);
				
			} 
			
			if (item.resetCurentH2){
				currentH2=null;
			}
			if (item.type=='p' && doc.y>720 && !item.fitToPage){
				doc.addPage();
			}
			if (blocks[i+1] && blocks[i+1].stuckWithPrevious && item.height > 0 && doc.y+item.height>600 && doc.y+item.height < 750){
				//doc.addPage();
			}
			if (item.type=='p' && blocks[i+1] && (blocks[i+1].type!=='p'&& blocks[i+1].type!=='image'&& blocks[i+1].type!=='images')){
				if (!item.params){
					item.params={};
				}
				//console.log(blocks[i+1].type, item.value.map(v=>v.rawText));
				item.params.addSpaceAfter=false;
				item.params.moveDown=0.001;
			}
			
			if (item.type=='p' && blocks[i+1] && (blocks[i+1].type==='image' || blocks[i+1].type==='images') && !blocks[i+1].dontAttachParagraphToImage && (doc.y+blocks[i+1].height)>750){

				if (blocks[i-1].type==='p'){
					doc.addPage();
					if (currentH2){
						this.drawActions[currentH2.type](doc, currentH2);
					}
				}
				else if (item.showTitleWhenParagraphBreaks || (item.params && item.params.showTitleWhenParagraphBreaks)) {
					//console.log('doc.y+blocks[i+1]', doc.y+blocks[i+1].height, doc.y, blocks[i+1])
					onAfterRender.push(()=>{
						doc.addPage();
						if (currentH2){
							this.drawActions[currentH2.type](doc, currentH2);
						}
					})
				}
				//console.log(blocks[i+1]);
				
			}
			
			
			if (item.type=='image' && (doc.y+item.height)>750){
				if (!item.fitToPage){
					doc.addPage();
				}
				else {
					const maxImgHeight=740-doc.y-70;
					if (item.marginTop){
						item.marginTop=0.4;
					}
					//console.log('maxImgHeight', maxImgHeight);
					item.width=getImgPropWidth({
						width:item.width || this.textWidth,
						height:item.height,
					}, maxImgHeight)
					item.height=maxImgHeight;
					item.align='center';
				}
			}
				
			/**/
			if (item.type==='h1' && blocks[i+1] && blocks[i+1].type==='h2' && !item.startOnNewPage && doc.y>620){
				doc.addPage();
			}
			if ((item.type=='h1' || item.type=='h2')  && blocks[i+1] && blocks[i+1].type==='image' && (doc.y+blocks[i+1].height)>740){
				doc.addPage();
			}
			if ((item.type=='h1' || item.type=='h2' || item.type=='h3' || item.type=='h4') && blocks[i+1] && blocks[i+1].type==='table' && doc.y>590){
				doc.addPage();
			}
			if (item.type=='p' && item.isTitle && blocks[i+1] && blocks[i+1].type==='list' && doc.y>670){
				doc.addPage();
			}
			if ((item.type=='h1' || item.type=='h2') && blocks[i+1] && blocks[i+1].type==='lessonPlanHeader' && blocks[i+2] && blocks[i+2].blockHeight && doc.y+blocks[i+2].blockHeight>640){
				doc.addPage();
			}	
			if (blocks[i+1]?.type==='lessonPlanHeader' && blocks[i]?.type==='p' && doc.y>658){
				//console.log('lessonPlanHeader', doc.y, blocks[i+1], blocks[i+2], blocks[i]);
				doc.addPage();
			}	
			if (blocks[i]?.type==='list'){
				//console.log('listBlock', doc.y, blocks[i+1], blocks[i-1], blocks[i]);
				//doc.addPage();
			}
			if ((item.type=='h1' || item.type=='h2') && blocks[i+1] && blocks[i+1].type==='table' && doc.y>600){
				doc.addPage();
			}	
			if ((item.type=='h1' || item.type=='h2') && blocks[i+1] && blocks[i+2] && blocks[i+1].type==='h3' && blocks[i+2].type==='p' && doc.y>600){
				doc.addPage();
			}		
			if ((item.type=='lessonPlanHeader') && blocks[i+1] && blocks[i+1].type==='p' && blocks[i+1].blockHeight && doc.y+blocks[i+1].blockHeight>740){
				doc.addPage();
			}	
			if (item.type=='p' && blocks[i+1] && blocks[i+1].type==='lessonPlanHeader' && blocks[i+1].isTotalTile && item.blockHeight && doc.y+item.blockHeight>700){
				doc.addPage();
			}	
			
			//const textLen=node.text.length;	
			if (doc && doc.page && doc.page.margins){
				doc.page.margins.bottom=47;
			}
			if (item.type=='p' && _.isArray(item.value)){
				
				const text=(item.value || []).map((n, index)=>n.text).join('');
				const textHeight=pTextHeight(item);
				
				if (blocks[i-1].type==='p' && blocks[i-2].type!=='p'){
					if (textHeight+doc.y>756 && textHeight+doc.y < 770 && (!item.parentEl || (item.parentEl && item.parentEl.tagName!=='ul'))){					
						doc.addPage();
					}
				}
				else if (blocks[i-1].type==='p' && (textHeight+doc.y)>760 && (textHeight+doc.y) < 765){
					doc.addPage();
				}
				
				
				//2+1
				if (between(doc.y, 706, 710) && between(textHeight, 40, 43)){
					doc.addPage();
				}
				
				//not break any paragraph! The bottom rules are ignored
				if (between(doc.y+textHeight, 740, 759) && blocks[i-1] && blocks[i-1].type==='p' && pTextHeight(blocks[i-1])>20){
					doc.addPage();
				}
				
				
				//n+1
				if (between(doc.y+textHeight, 754, 756) && textHeight > 44){
					doc.page.margins.bottom=55;
				}
				
				//n+1							//740, G8U3:3.17 issue
				if ((between(doc.y+textHeight, 694, 753) && textHeight > 41) || (doc.y>600 && item.fitToPage)){//item.fitToPage
					doc.page.margins.bottom=40;
				}
				
				//n+1 with previous p
				if (between(doc.y+textHeight, 748, 754) && textHeight > 44 && blocks[i-1] && blocks[i-1].type==='p'){
					doc.page.margins.bottom=55;
				}
				
				//single strong line
				if (between(doc.y, 717, 754) && between(textHeight, 13, 14) && item.value.length===1 && item.value[0].tagName==='strong'){
					doc.addPage();
				}
				
				if (text.indexOf('Isolated in Chile’s northern Atacama Desert, the open-pit Escondida')>=0){
					console.log('textHeight', textHeight, doc.y, textHeight+doc.y, text, doc.page.margins, item);				
				}
				//console.log('textHeight', textHeight, doc.y, textHeight+doc.y, (item.value || []).map(n=>n.text).join(''));				
					
			}	
			
			if ((item.type=='h2' || item.type=='h3') && blocks[i-1] && blocks[i-1].type==='h1'){
				item.moveDown=0.1;
			}
			item.startPageNum=this.pageNum;
			
			this.drawActions[item.type](doc, item);
			onAfterRender.forEach(fn=>fn());
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
		this.totalPageNumber=range.count;
		this.pdfGenIterator++;
		//console.log(this.headers);
	}

}

module.exports = PDFUtils;