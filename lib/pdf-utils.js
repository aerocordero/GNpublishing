const PdfTable = require('./voilab-table');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const _ = require('lodash');
const SVGtoPDF = require('svg-to-pdfkit');
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

PDFDocument.prototype.addSVG = function(svg, x, y, options) {
	return SVGtoPDF(this, svg, x, y, options), this;
};

class PDFUtils {

	isRightPage(){
		return this.pageNum%2>0;
	}
	isLeftPage(){
		return this.pageNum%2===0;
	}

	constructor (colors, fonts, textIdents){
		this.colors=colors;
		this.fonts=fonts;
		this.textIdents=textIdents;
		this.contents=[];
		this.contentsPagesNumber=1;
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
					this.currentTitle=item.blankPageTitle || null;
					doc.addPage();
				}
				if (styles.startOnNewPageIfYisMoreThan && doc.y>=styles.startOnNewPageIfYisMoreThan){
					console.log('startOnNewPageIfYisMoreThan', doc.y, styles.startOnNewPageIfYisMoreThan);
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
				if (styles.leftIdents){
					x=this.isRightPage() ? styles.leftIdents.rightPage : styles.leftIdents.leftPage;
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
					if (item.svgIcon){
						const svg=fs.readFileSync(item.svgIcon, 'UTF-8')
						const iconWidth=50;
						doc
							.addSVG(svg, x, y, {
								width: iconWidth,
								//height: 525,				  
							});
						
						x+=iconWidth+3;
						y+=(iconWidth/2)-15;
					}
					doc
					  .font(styles.font || fonts.regular)
					  .fontSize(styles.fontSize)
					  .fill(styles.color)
					  .text(styles.value, x, y, {
					  	width: styles.width || this.textWidth,
					  	align: styles.align || 'left'
					  });
					if (item.svgIcon){
						doc.moveDown(1);	
					}
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
				//console.log(doc.y);
				if (doc.y>720){
					doc.addPage();
				}
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
					let parentStyles={};			
					const setStyles=(styles, node)=>{
						(node.getAttribute && node.getAttribute('style') ? node.getAttribute('style').split(';') : []).map(item=>{
							const arr=item.split(':');
							if (arr && arr.length>1){
								styles[arr[0].trim()]=arr[1].trim();
							}
						});
						return styles;
					}	
					if (item.parentEl && item.parentEl.getAttribute){
						parentTagName=item.parentEl.tagName;
						parentClass=item.parentEl.getAttribute('class') || '';
						parentStyles=setStyles(parentStyles, item.parentEl);
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
									item.hasImages=true;
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
					if (!item.hasImages){
						item.hasImages=imagesAfter && imagesAfter.length>0;
					}
					item.hasImages=imagesAfter && imagesAfter.length>0;
					if (imagesAfter && imagesAfter.length && imagesAfter[0].firstRowHeight){
						item.blockHeight=textHeight+imagesAfter[0].firstRowHeight;
						//item.hasImages=true;
						if (textHeight+imagesAfter[0].firstRowHeight+doc.y>750){
							//doc.addPage();
							//item.hasImages=true;
						}
						if (item.parentItem){
							item.parentItem.blockHeight=item.blockHeight+(item.parentItem.blockHeight || 0);
						}
					}
					else {
						item.blockHeight=textHeight;
					}
			
					if (bulletParams){
						if (doc.y > 732){
							//doc.addPage();
						}
						if (!bulletParams.isNumber){
							if (bulletParams.style==='fill' && ulLevel!==2){
								doc.circle(leftTextIdent+ident-12+(params.listsIdent || 0), doc.y+8, 2)	
									.fill("black");
							}
							if (bulletParams.style==='stroke' && ulLevel!==1){
								doc.circle(leftTextIdent+ident-12+(params.listsIdent || 0), doc.y+8, 2)	
									.strokeColor('black')
									.stroke();
							}
						}
						else {
							const oldY=doc.y;
							const oldPage=doc.page;
							let symbol=(params.index+1);
							const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXUZ';
							if (bulletParams.listStyleType==='upper-alpha'){
								symbol=alphabet[params.index];
							}
							
							//listStyleType
							doc.fillColor('black')
								.font(fonts.bold)
								.lineGap(params.lineGap || 1.2)
								.fontSize(params.fontSize || this.defaultFontSize)
							.text(symbol+'.', leftTextIdent+ident-14+(params.listsIdent || 0), doc.y, {
								continued: false,
								align:'left',
							});
							if (oldPage===doc.page){
								doc.y=oldY;
							}
							else {
								doc.y=this.textIdents.top;
							}
							
							//doc.x-=10;
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
						doc.y+=6;
						item.blockHeight+=60;
						const boxColors={
							sep: ['#b8cce4', '#0066b3'],
							ccc: ['#DAE2CA', '#7DA953']
						}
						const boxType=parentClass.indexOf('sep') > 0 ? 'sep' : 'ccc';
						ident=12;
						moveDown=1;
						const boxH=doc
							.font(fonts.regular)
						  	.fontSize(10).heightOfString(item.value.map(n=>n.text).filter(txt=>txt && txt!=='\n').join('\n'), {
							width: this.textWidth-(ident*2),
							//continued: false
						})+(ident*2)+20+3+(item.value.length > 2 ? (item.value.length-2)*4 : 0);

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
								
								if (doc.y>725 && index==0 && item.value.length>1){
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
								////list-style-type: upper-alpha;
								
								this.drawActions.p(doc, {
									value: node.childNodes.filter(n=>n.tagName!=='ul'),
									isHtml: true,
									parentEl: node,
									bulletParams: {style: params.listBulletType || bulletStyles[ulLevel], isNumber: parentTagName==='ol', listStyleType: parentStyles['list-style-type']},
									parentItem: item,
									params: {
										ident:liIdent+ident+firstIdent+(params.listsIdent || 0),
										width: width-(liIdent)-(params.listsIdent || 0)-firstIdent,
										leftTextIdent: leftTextIdent,
										lineGap: 1,
										addSpaceAfterSize: ulChild ? 5 : (innerAddSpaceAfterSize || 8),
										//addSpaceAfter,
										processListsAsBlocks: true,
										parentEl: node,
										replaceFn: params.replaceFn,
										bulletParams: {},
										moveDown: ulChild ? 0.0000003 : 0,
										index,
										fontSize: params.fontSize
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
										parentItem: item,
										params: {
											ident:liIdent+(params.childUlIdent || 0)+ident+(params.listsIdent || 0),
											width: width-(liIdent)-(params.listsIdent || 0),
											leftTextIdent: leftTextIdent,
											lineGap: params.lineGap,
											addSpaceAfterSize: params.childUlAddSpaceAfterSize || 3,
											processListsAsBlocks: true,
											isLastParent: index==item.value.length-1,
											fontSize: params.fontSize,
											replaceFn: params.replaceFn,
										}
									});
								}
								
								lastTag='li';
								if (index==item.value.length-1 && params.ulMarginTop && !params.isLastParent){
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
								if (index>0 && index<item.value.length-1){
									doc.moveDown(0.3);
								}
								
							}
						}
						else if (node.imageParams){	
							this.drawActions.image(doc, {
								...node.imageParams.blockParams,
								x: ident+65,
							});
							item.blockHeight+=node.imageParams.blockParams.height;
							//console.log(item);
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
								
								if (item.parentEl){
									setStyles(styles, item.parentEl);
								}
								setStyles(styles, node);
								
								//console.log('styles', styles);
								const notEmptyChildren=(node.childNodes || []).filter(n=>n.rawText.trim());
								const childrenStyles=_.keys(_.groupBy(notEmptyChildren, node=>node.getAttribute ? node.getAttribute('style') : ''));
								if (notEmptyChildren[0] && notEmptyChildren[0].tagName==='strong' && notEmptyChildren.length<=2){
									node.tagName='strong';
								}
								if (node.tagName==='strong' && notEmptyChildren[0]?.tagName==='span' && (notEmptyChildren.length<2 || childrenStyles.length===1)){
									setStyles(styles, notEmptyChildren[0])
								}
								//console.log(node);
								
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

					
								doc.fillColor(styles.color || 'black')
									.font(tagFonts[node.tagName] || fonts.regular)
									.lineGap(params.lineGap || 1.2)
									.fontSize(params.fontSize || this.defaultFontSize)
							   .text(str/*.trimStart()*/, leftTextIdent+(ident || 0), doc.y, {
									width,
									continued: true,
									lineBreak: true,
									//lineGap: node.tagName==='symbol' ? -3 : 0,
									align: /*styles['text-align'] || */'left',
									underline: node.tagName==='u',
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
						.font(item.font || params.font || fonts.regular)
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
					console.log(params.image);
					doc.image(params.image.value, params.image.x, startY+params.image.marginTop, {width: params.image.width});
				}
				
				/*
				if (params.border){
					node /home/ec2-user/pptx2pdf/cli.js "/home/ec2-user/GNpublishing/lib/../tmp/e-storm-of-the-century-phenomenon.pdf" --png --output-dir="/home/ec2-user/GNpublishing/public/e-storm-of-the-century-phenomenon" --resize=2400 --density=600
					doc.rect(startX, startY, width, doc.y).stroke();
				}
				*/
				if (imagesAfter && imagesAfter.length){					
					item.hasImages=true;
					if (item.parentItem){
						item.parentItem.hasImages=true;
					}
					//console.log('Images Item', item.parentItem);
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
						if (pdfPreviews.length === 2 && pdfPreviews[0].width <= pdfPreviews[0].height){
							imgX+=62;
						}

						pdfPreviews.forEach(img=>{
							if (img.imgInfo){
								img.width=pdfPreviews.length<3 ? 185 : 160;
								if (img.width > img.height){
									if (pdfPreviews.length===1){
										img.width=250;
									}
									if (pdfPreviews.length===2){
										img.width=(612-(this.textIdents.left+this.textIdents.right))/2-0;
									}
								}
								img.height=getImgPropheight(img.imgInfo, img.width);
							}
							if (pdfPreviews.length===1){
								imgX=this.textIdents.left+(612-(this.textIdents.left+this.textIdents.right))/2-img.width/2;
							}
							
							img.x=imgX;
							imgX+=img.width;
							if ((imgX+img.width)>600){
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
				if (doc.y+item.height>840 && !item.svgContentProcessing){
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
				if (!(item.value.indexOf('.gif')===item.value.length-4 || item.value.indexOf('.svg')===item.value.length-4)){
					console.log(this.noImageMode ? blankImg : item.value);
					doc.image(this.noImageMode ? blankImg : item.value, item.x || doc.x, doc.y, {width: item.width || this.textWidth, height: item.height || undefined});
				}
				else if (item.value.indexOf('.svg')===item.value.length-4){
					let svg=fs.readFileSync(item.value, 'UTF-8');
					if (item.svgContentProcessing){
						svg=item.svgContentProcessing(svg, doc.x, doc.y);
					}
					doc.addSVG(svg, item.x || doc.x, item.y || doc.y, {width: item.width || this.textWidth, height: item.height || undefined});
				}
				
				if (item.y){
					doc.x=prevX;
					doc.y=prevY;
					//doc.save();
				}
				else {
					doc.moveDown(item.params?.moveDown || 0.5);
				}
				
			},
			images:(doc, item)=>{
				doc.moveDown(0.2);
				if (item.marginTop){
					doc.y+=item.marginTop;
				}
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
					if (image.file){
						image.file.pageNum=0;
					}
				});

				if (item.file){
					item.file.pageNum=this.pageNum-this.startPagingPage;
					if (!item.file.isOnline){
						item.file.page='Page '+item.file.pageNum;	
					}
				}
				/*
				fs.writeFileSync(item.value[0].path.split('/')[item.value[0].path.split('/').length-1]+'.json', JSON.stringify({
					keys: Object.keys(item),
					file:  item.file ? item.file.fileName : '',
					images: item.value
				}, null, 4));
				*/
				
				item.value.forEach((image, index)=>{
					if (image.file && !image.file.pageNum){
						image.file.pageNum=this.pageNum-this.startPagingPage;
						if (!image.file.isOnline){
							image.file.page='Page '+image.file.pageNum;	
						}
					}
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
					console.log(image.path, doc.x, doc.y, y, image.x);
					const imgX = doc.x;
					const imgY = doc.y;
					//console.log(image);
					const imgPath=this.noImageMode ? blankImg : image.path;
					if (!fs.existsSync(imgPath)){
						console.log('Not found Image file', imgPath);
						return;
					}
					//console.log(imgPath, image, {width: image.width || this.textWidth, height: image.height || undefined});
					doc.image(imgPath, {width: image.width || this.textWidth, height: image.height || undefined});
					if (doc.y>maxY){
						maxY=doc.y;
					}
					
					const strokeParams={
						width:1,
						color:item.borderColor || 'black'
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
				let {columns, data, fontSize, hideHeaders, borderColor, headerColor, headerFill, headerBorderColor, leftIdent, padding, headerPadding, marginTop}=item;
				if (!padding){
					padding=4;
				}
				//console.log({columns, data});
				if (leftIdent){
					doc.x=leftIdent;
				}
				if (marginTop) {
					doc.y+=marginTop;
				}
				const prevY=doc.y;
				let table = new PdfTable(doc, {
					bottomMargin: 20,
					showHeaders: !hideHeaders
				});
				
				headerPadding=headerPadding || padding;
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
						headerFill: headerFill || 'white',
						headerBorderColor: headerBorderColor || borderColor || '#999',
						headerBorderOpacity: 1,
						headerPadding: [headerPadding,headerPadding,headerPadding,headerPadding],
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
					this.startPagingPage=this.pageNum-1+(this.contentsPagesNumber-1);
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
			setObjectPageNum: (doc, {value}) => {
				value.pageNum=this.pageNum-this.startPagingPage;
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
						file.page='Page '+file.pageNum;	
					}
					//file.inlinePageRef='access online';	
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
			contents: (doc, {contentsPagesNumber})=>{
				if (!this.contents.length){
					doc.addPage();
					this.contentsPage=this.pageNum;		
					console.log('this.contentsPagesNumber', contentsPagesNumber);
					if (contentsPagesNumber>1){
						doc.addPage();					
					}
					this.contentsPagesNumber=contentsPagesNumber;
					return;
				}				
				/*
				if (this.contentsPagesNumber>1){
					doc.addPage();
				}*/
			
				//console.log(doc.page);
			},
			lessonFiles: (doc, {value, file, contentsObj, leftIdent, width, height, bottomBoxY, headerParams, footerParams, rightBoxX, firstPageMove, leftBoxWidth, marginTop})=>{
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
					if (marginTop){
						doc.y+=marginTop;
					}
					//console.log(image);
					const imgPath=this.noImageMode ? blankImg : image.path;
					if (!fs.existsSync(imgPath)){
						console.log('Not found Image file', imgPath);
						return;
					}
					doc.image(this.noImageMode ? blankImg : image.path, {
						width: width || 612,
						height: height || 792,
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
						leftText: file.fileTitle,
						...footerParams
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
			notesPage: (doc, params)=>{
				
				this.currentTitle={
					leftTitle: '',	
					type: 'lamp',
					topWhiteOverlayHeight: 0,
					lineY: 45,					
				}
				doc.addPage();	
				this.writeNotesPage(doc, this.pageNum, params);
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
			level2: {
				font: this.fonts.regular,
				fontSize: 10,
			},
			levelIdent: 20,
			width: this.textWidth,
			moveDown: 0.1
		}
	}
	writeSectionCover (doc, {title, image, color, addContents}) {		
		
		this.currentTitle= null;

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
	
	writeHeader(doc, header, pageNum){
		if (!header || !header.titleLeft){
			return;
		}
		//doc.x=60;
		
		const textIdents={
			left: 48,
			top: 85
		}
		const contentWidth=540;	
		let lineY=header.lineY || 65;
		let lineWidth=2;

		if (header.type==='outerBox'){
			
			doc
				.font(this.fonts.bold)
				.fontSize(24)
				.fillColor(header.color)
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
				.fill(header.color);	
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
					.fill(header.color);	

			}	
		}
		else if (header.type==='chapter' && header.chapter){
			doc
			.moveTo(60, 30)
			.font(this.fonts.bold)
			.fontSize(18)
			.fill(header.textColor || header.color || this.colors.unitTitle || 'black')
			.text(header.titleLeft, this.textIdents.left, (header.titleLeftTopIdent || 25),{
				width: this.textWidth,
				align: 'center',
				underline: true
			});
			
			doc
			.font(this.fonts.bold)
			.fontSize(32)
			.fill(header.textColor || header.color || this.colors.unitTitle || 'black')
			.text(header.titleRight || header.chapter.name, this.textIdents.left, (header.titleLeftTopIdent || 25)+30,{
				width: this.textWidth,
				align: 'center',
				//underline: true
			});
		}
		else {
			const titleLeftHeight=doc
				.fontSize(header.titleLeftFontSize || 16)
				.font(this.fonts.bold)
				.heightOfString(header.titleLeft, {
					width: 476,
					continued: false
				});
			
			doc
			.moveTo(60, 30)
			.font(this.fonts.bold)
			.fontSize(header.titleLeftFontSize || 16)
			.fill(header.textColor || header.color || this.colors.unitTitle || 'black')
			.text(header.titleLeft, this.textIdents.left, (header.titleLeftTopIdent || 25)-(titleLeftHeight > 24 ? 8 : 0), {
				lineGap: -4,
				width: 476,
			});
		
			doc
			.font(this.fonts.semiBold)
			.fontSize(14)
			.fill(header.textColor || 'black')
			.text(header.titleRight, 70, 30, {
				width: 460,
				align: 'right'
			});
		
			if (header.icon){
				doc
				.image(header.icon, 543, 15, {
				width: 35,
				align: 'center',
				valign: 'center'
				});
			}
			
			
			//doc.text(pageNum, textIdents.left, 600) 
			const lineStartX=header.lineStartX || 38;
			const lineEndX=header.lineEndX || 574;
			const lineY=header.lineY || 55;
			doc
			.save()
			.moveTo(lineStartX, lineY)
			//.lineTo(50, 40)
			.lineTo(lineEndX, lineY)
			.lineTo(lineEndX, lineY+2)
			.lineTo(lineStartX, lineY+2)
			.fill(header.color || this.colors.unitTitle);	
		}
		
		
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
		const addHeader=(pageNum)=>{
			if (s.headerParams){
				this.writeHeader(doc, {
					titleLeft: s.title.text,
					icon: s.headerParams.icon,
					...s.headerParams
				}, pageNum);
				doc.moveDown(1);
			}
			else {
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
			}
			doc.moveDown(0.2);
		}
		
		addHeader(1);
		
		
		const leftIdent=s.leftIdent || this.textIdents.left;
		
		this.contents.forEach(item=>{
			if (item.level===0 && s.level0.underline){
				doc.moveDown(0.2);
			}
			if (item.level===0 && doc.y > 740){				
				doc.switchToPage(this.contentsPage);
				this.contentsPagesNumber++;
				doc.y=50;
				addHeader(2);
		   	}
			let y=doc.y;
			let lineStart;
			let lineY=doc.y+11;
			
			//console.log(item);
			if (item.level===0){
				if (s.level0.underline){
					doc.moveDown(0.2);
					let y=doc.y;
				}
				doc
				  .font(s.level0.font)
				  .fontSize(s.level0.fontSize)
				  .fillColor(item.color || 'black')
				  .text(item.title, leftIdent, y, {
					align: 'left',
					//underline: s.level0.underline
				  });
				if (item.pageNum){
					lineStart=doc.x+doc.widthOfString(item.title, {
						font: s.level0.font,
					  	fontSize: s.level0.fontSize
					})+7;
					
					if (s.level0.underline){
						y+=4;
					}
					doc
					  .font(s.level0.font)
					  .fontSize(s.level0.fontSize)
					  .text(item.pageNum, 70, y, {
						width: s.width-5,
						align: 'right'
					  });
					if (!s.level0.underline){
						this.drawCircleDotsLine(doc, lineStart, lineY, (s.width+55)-((item.pageNum+'').length*4)-lineStart, 0.5, item.color);
						
					}
					else {
						doc.lineWidth(1)
						.strokeColor(item.color)
						.moveTo(leftIdent, lineY+6)
						.lineTo((s.width+58)-((item.pageNum+'').length*6), lineY+6)
						//.dash(2, {space: 2})
						.stroke();
						y+=4;
					}
					
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
			if (item.level===2 && s.level2){
				if(item.title.length > 100){
					var trimmedString = item.title.substr(0, 100);
					item.title = trimmedString.substr(0, Math.min(trimmedString.length, trimmedString.lastIndexOf(" ")))
				}
				doc
				  .font(s.level2.font)
				  .fontSize(s.level2.fontSize)
				  .fillColor(item.color || 'black')
				  .text(item.title, leftIdent+(s.levelIdent*2), y, {
					width: s.level2.width || s.width,
					align: 'left',
					lineGap: 1
				  });
				lineStart=doc.x+doc.widthOfString(item.title, {
					font: s.level2.font,
					fontSize: s.level2.fontSize
				})+5;
				let strHeight=parseInt(doc.heightOfString(item.title, {
					width: s.width-5,
					font: s.level2.font,
					fontSize: s.level2.fontSize
				}));
				doc
				  .font(s.level2.font)
				  .fontSize(s.level2.fontSize)
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
				this.contentsPagesNumber++;
				doc.y=50;
				addHeader(2);
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
		const pageWidth=612;
		const textIdents={
			left: 32,
			top: 85
		}
		const hideLine=footerData && footerData.hideLine;

		const chapterBadge={
			top:100,
			width: 26,
			height: 65,
			text: 'Section 1',
			color: currentHeader?.color || this.colors.unitTitle,
			bageNum: 1,
			totalBadges: 8,
			innerIdent: 5,
			maxSpaceHeight: 590,
			...currentHeader?.chapterBadge,
		};

		chapterBadge.height=parseInt((chapterBadge.maxSpaceHeight-((chapterBadge.totalBadges-1)*chapterBadge.innerIdent))/chapterBadge.totalBadges);
		if (chapterBadge.bageNum>1){
			chapterBadge.top+=(chapterBadge.height+chapterBadge.innerIdent)*(chapterBadge.bageNum-1);
		}
		

		
		const pageNumBoxSize=textIdents.left+16;
		
		if (pageNum%2===0){
			
			if(!hideLine && currentHeader){
				doc
				.save()
				.moveTo(-10, lineY-20)
				//.lineTo(50, 40)
				.lineTo(pageNumBoxSize-10, lineY-20)
				.bezierCurveTo(pageNumBoxSize-10, lineY-20, pageNumBoxSize, lineY-20, pageNumBoxSize, lineY-10)
				.lineTo(pageNumBoxSize, lineY+lineWidth)
				.lineTo(-10, lineY+lineWidth)
				.fill(currentHeader?.color || this.colors.unitTitle);	

				doc
				.save()
				.moveTo(textIdents.left	+16, lineY)
				//.lineTo(50, 40)
				.lineTo(contentWidth+textIdents.left+2, lineY)
				.lineTo(contentWidth+textIdents.left+2, lineY+lineWidth)
				.lineTo(textIdents.left+16, lineY+lineWidth)
				.fill(currentHeader.color || this.colors.unitTitle);	
				
				doc
					.font(this.fonts.arial)
					.fontSize(6)
					.fill('black')
					.text('© '+((new Date()).getYear()+1900)+' Green Ninja', textIdents.left-14, lineY+5, {
						width: contentWidth+16,
						continued: false,
						align: 'right'
					});

					
				doc
					.save()
					.moveTo(-10, chapterBadge.top)
					//.lineTo(50, 40)
					.lineTo(chapterBadge.width-10, chapterBadge.top)
					.bezierCurveTo(chapterBadge.width-10, chapterBadge.top, chapterBadge.width, chapterBadge.top, chapterBadge.width, chapterBadge.top+10)
					.lineTo(chapterBadge.width, chapterBadge.top+chapterBadge.height-10)
					.bezierCurveTo(chapterBadge.width, chapterBadge.top+chapterBadge.height-10, chapterBadge.width, chapterBadge.top+chapterBadge.height, chapterBadge.width-10, chapterBadge.top+chapterBadge.height)
					.lineTo(-10, chapterBadge.top+chapterBadge.height)
					.fill(chapterBadge.color);	

				doc
					.save()
					.font(this.fonts.bold)
					.fontSize(12)
					.fill('white')
					.rotate(-90)
					.save()
					.text(chapterBadge.text, -chapterBadge.top-chapterBadge.height, chapterBadge.width-20,{
						width: chapterBadge.height,
						align: 'center'
					}).rotate(90).save();

					
			}
		 
			
		
		doc
		.font(this.fonts.regular)
		.fontSize(12)
		.fill(hideLine || !currentHeader ? 'black' : 'white')
		.text(pageNum, pageNumBoxSize-28, lineY-17, {
			width: 465,
			continued: false,
			align: 'left'
		});

		
	}
	else {
		
		if(!hideLine && currentHeader){
			doc
			.save()
			.moveTo(pageWidth-pageNumBoxSize, lineY-10)
			//.lineTo(50, 40)
			.bezierCurveTo(pageWidth-pageNumBoxSize, lineY-10, pageWidth-pageNumBoxSize, lineY-20, pageWidth-pageNumBoxSize+10, lineY-20) 
			.lineTo(pageWidth+10, lineY-20)
			.lineTo(pageWidth+10, lineY+lineWidth)
			.lineTo(pageWidth-pageNumBoxSize, lineY+lineWidth)
			.fill(currentHeader?.color || this.colors.unitTitle);	

			doc
			.save()
			.moveTo(38, lineY)
			//.lineTo(50, 40)
			.lineTo(pageWidth-pageNumBoxSize, lineY)
			.lineTo(pageWidth-pageNumBoxSize, lineY+lineWidth)
			.lineTo(38, lineY+lineWidth)
			.fill(currentHeader.color || this.colors.unitTitle);	
			doc
			.font(this.fonts.arial)
			.fontSize(6)
			.fill('black')
			.text('© '+((new Date()).getYear()+1900)+' Green Ninja', 38, lineY+5, {
				width: contentWidth,
				continued: false,
				align: 'left'
			});

			const boxLeftIdent=pageWidth-chapterBadge.width;
			doc
				.save()
				.moveTo(boxLeftIdent, chapterBadge.top+10)
				.bezierCurveTo(boxLeftIdent, chapterBadge.top+10, boxLeftIdent, chapterBadge.top, boxLeftIdent+10, chapterBadge.top)
				.lineTo(pageWidth+10, chapterBadge.top)						
				.lineTo(pageWidth+10, chapterBadge.top+chapterBadge.height)
				.lineTo(boxLeftIdent+10, chapterBadge.top+chapterBadge.height)
				.bezierCurveTo(boxLeftIdent+10, chapterBadge.top+chapterBadge.height, boxLeftIdent, chapterBadge.top+chapterBadge.height, boxLeftIdent, chapterBadge.top+chapterBadge.height-10)
				.lineTo(boxLeftIdent, chapterBadge.top+chapterBadge.height)
				.fill(chapterBadge.color);	

				doc
				.save()
				.font(this.fonts.bold)
				.fontSize(12)
				.fill('white')
				.rotate(-90)
				.save()
				.text(chapterBadge.text, -chapterBadge.top-chapterBadge.height, boxLeftIdent+5,{
					width: chapterBadge.height,
					align: 'center'
				}).rotate(90).save();
		}
		
		
		
		doc
		.font(this.fonts.regular)
		.fontSize(12)
		.fill(hideLine || !currentHeader ? 'black' : 'white')
		.text(pageNum, pageWidth-pageNumBoxSize+14, lineY-17, {
			//width: contentWidth,
			continued: false,
			align: 'left'
		});
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
			if ((item.type=='h1' && !item.startOnNewPage) || item.type=='h2' || item.type=='h3' || item.type=='h4'){
				
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
					|| (item.type==='h1' && blocks[j].type==='lessonPlanHeader' && !blocks[j].planIndex)
					|| (blocks[j].type==='line')
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
						item.sectionHeight+=blocks[j].height+10;
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
					if (blocks[j].type==='line'){
						item.sectionHeight+=5;
					}
					if (pCounter<2){
						item.firstParagraphHeight=item.sectionHeight;
					}
					item.pCounter=pCounter;
					j++;
				}
				if (item.value==="2."){
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
				else if (doc.y+item.sectionHeight>709 && item.sectionHeight<610 && doc.y<720 && !item.startOnRightSide && (item.moveToNextPageIfNotFit || item.lastElType=='image')){
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
				if (item.value==="2."){
					console.log('Section Size end', item.value, item.sectionHeight, doc.y, doc.y+item.sectionHeight, blocks[i-1],item, blocks[i+1], blocks[i+2], blocks[i+3], blocks[i+4], pCounter);
				}
				
				//console.log('item.sectionHeight', item.sectionHeight, item.value);
				/**/
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
			
			if (item.type=='p' && blocks[i+1] && (blocks[i+1].type==='image' || blocks[i+1].type==='images') && !blocks[i+1].dontAttachParagraphToImage && (doc.y+(item.height || 0)+blocks[i+1].height)>750){

				if (blocks[i-1].type==='p'){
					doc.addPage();
					if (currentH2 && !item.params?.notShowTitleWhenParagraphBreaks){
						this.drawActions[item.params.showTitleWhenParagraphBreaksType || currentH2.type](doc, currentH2);
					}
				}
				else if (item.showTitleWhenParagraphBreaks || (item.params && item.params.showTitleWhenParagraphBreaks)) {
					//console.log('doc.y+blocks[i+1]', doc.y+blocks[i+1].height, doc.y, blocks[i+1])
					onAfterRender.push(()=>{
						doc.addPage();
						if (currentH2){
							this.drawActions[item.params.showTitleWhenParagraphBreaksType || currentH2.type](doc, currentH2);
						}
					})
				}
				//console.log(blocks[i+1]);
				
			}
			
			
			if (item.type=='image' && (doc.y+item.height)>750 && !item.svgContentProcessing){
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
		
			if (item.type=='p' && item.textHeight===item.blockHeight && blocks[i+1].type==='image' && doc.y+item.blockHeight+blocks[i+1].height > 720) {
				doc.addPage();
			}
			if (item.type=='p' && item.hasImages && doc.y+item.blockHeight > 720 && item.blockHeight < 600) {
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
				
				//console.log(doc.y+textHeight, textHeight);
				//n+1
				

				if (between(doc.y+textHeight, 754, 756) && textHeight > 44){
					doc.page.margins.bottom=55;
				}
				
				//n+1							//740, G8U3:3.17 issue
				if ((between(doc.y+textHeight, 694, 753) && textHeight > 41) || (doc.y>600 && item.fitToPage)){//item.fitToPage
					doc.page.margins.bottom=40;
				}
				if (between(doc.y+textHeight, 719, 725) && textHeight > 21){//item.fitToPage
					doc.page.margins.bottom=40;
				}
				
				//n+1 with previous p
				if (between(doc.y+textHeight, 748, 754) && textHeight > 44 && blocks[i-1] && blocks[i-1].type==='p'){
					doc.page.margins.bottom=55;
				}

				if (between(doc.y+textHeight, 750, 754) && between(textHeight, 54, 56)){
					doc.page.margins.bottom=60;
				}
				
				//single strong line
				if (between(doc.y, 717, 754) && between(textHeight, 13, 14) && item.value.length===1 && item.value[0].tagName==='strong'){
					doc.addPage();
				}
				//hasImages
				if (item.type==='p' && item.blockHeight < 15 && blocks[i+1]?.hasImages && item.blockHeight+blocks[i+1].blockHeight+doc.y >= 740 ){
					doc.addPage();
				}
				if (item.hasImages && item.blockHeight+doc.y >= 720 ){
					//doc.addPage();
				}
				
				if (text.indexOf('Follow all lab safety requirements')>=0){
					console.log('textHeight::', textHeight, blocks[i].hasImages, blocks[i+1].type, blocks[i+1]?.hasImages, doc.y, textHeight+doc.y, text, doc.page.margins, item, blocks[i+1], blocks[i+2], blocks[i+3]);				
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
		  this.writeHeader(doc, this.headers[i+1], i+1-this.startPagingPage);
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
			
			console.log('this.contentsPagesNumber', this.contentsPagesNumber);
			
		}
	
		doc.end();
		this.totalPageNumber=range.count;
		this.pdfGenIterator++;
		//console.log(this.headers);
	}

}

module.exports = PDFUtils;