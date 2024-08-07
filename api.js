const _ = require('lodash');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const fs = require('fs');
const moment=require('moment');
const shell = require('shelljs');
const child = require('child_process')
const filesize=require('filesize');
const nanoid=require('nanoid').nanoid;
const config = require('./config.json');
const rimraf = require("rimraf");
const mysql = require('mysql2/promise');


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

const {
	dbQuery,
	closeDbConnection,
	asyncForEach,
	loadQueue,
	saveQueue,
	imgInfoJogPath,
	downloadFile,
	convertPdf,
	convertPptxPdf,
	dbConfig,
	uploadToGoogleDrive
} = require('./lib/utils');

let queue=loadQueue();
let socketClients=[];
let logStreams={};

const refreshQueueItems=()=>{
	const newQueue=loadQueue();
	queue.forEach((item, index)=>{
		Object.assign(item, newQueue.find(nq=>nq.id===item.id) || {});
	});
}

const saveCurrentQueue=()=>{
	saveQueue(queue);
}
const onQueueItemsAdded=()=>{
	socketClients.forEach(client=>{
		client.send(JSON.stringify({type:'status', queue: queue.filter(item=>!item.hidden)}));
	})
};

const onQueueItemUpdated=(item)=>{
	item.updatedAt=new Date().valueOf();
	saveCurrentQueue();
	socketClients.forEach(client=>{
		client.send(JSON.stringify({type:'itemUpdated', item}));
	})
};


const router = express.Router();

const processQueue=()=>{
	const run=async()=>{
		//queue=loadQueue();
		refreshQueueItems();
		let nextItem=queue.find(item=>item.status==='pending');
		const currentItem=queue.find(item=>item.status==='inProgress');
		if (currentItem || !nextItem){
			return;
		}

		if (nextItem){
			const getPdfFileName={
				workbook: (item, model, unit)=>item.params.state.name+' Workbook '+model.display_name+' Unit '+unit.number
					+(item.params.language && item.params.language==='spanish' ? '(spanish)' : '')
					//+(item.params.type ? ' v'+item.params.type : '')				
					+(item.params.worksheetSource ? ' ('+item.params.worksheetSource+')' : '')	
					+(item.params.disableImages ? ' (no images)' : '')						
					+'.pdf',
				teacherbook: (item, model, unit)=>item.params.state.name+' TC '+model.display_name+' Unit '+unit.number
					+(item.params.disableImages ? ' (no images)' : '')
					+'.pdf',
			}
			const params=nextItem.params;
			console.log(params);	
			const db=params.state.db || 'new';
			const myPool =  mysql.createPool({
				...dbConfig,
				database: 'greenninja_'+db
			});	
		
			const model=(await dbQuery([
				'SELECT * FROM `model` t',
				'WHERE t.`model_id` = ?'
			], [params.model], myPool))[0];
	
			const unit=(await dbQuery([
				'SELECT * FROM `unit` t',
				'WHERE t.`unit_id` = ?'
			], [params.unit], myPool))[0];
			unit.number=model.unit_id.split(',').indexOf(unit.unit_id+"")+1;
			nextItem.fileName=getPdfFileName[nextItem.type](nextItem, model, unit);
	
			const destFilePath='result/'+nextItem.fileName;
			if (fs.existsSync('./'+destFilePath)){
				fs.unlinkSync('./'+destFilePath);
			}			
		
			const cmd='node '+nextItem.type+'.js --model='+params.model+' --unit='+params.unit+' --db='+params.state.db
				+(params.type===1 ? ' --first-export' : '')
				//+(params.flushCache ? ' --flush-cache' : '')
				+(params.language ? ' --language="'+params.language+'"' : '')
				+(params.worksheetSource ? ' --ws-source="'+params.worksheetSource+'"' : '')
				+(config.alwaysFlushDBCache ? ' --ignore-db-cache' : '')
				+' --dest-path="'+destFilePath+'"'
				+(params.disableImages ? ' --disable-images' : '')
				+(params.reloadGDocs ? ' --reload-gdocs' : '')
				+' --queue-item-id="'+nextItem.id+'"';
			console.log(cmd);
		
			nextItem.status='inProgress';
			nextItem.hidden=false;
			saveCurrentQueue();		
			onQueueItemUpdated(nextItem);
			const childProcess=child.exec(cmd, {maxBuffer:10240 * 1024, timeout:0}, (err)=>{
				refreshQueueItems();				
				if (err || !fs.existsSync('./'+destFilePath)){
					nextItem.status='error';
					nextItem.error=err;
				}
				else {
					nextItem.status='success';
					nextItem.googleDriveUploading=true;
					uploadToGoogleDrive(nextItem.fileName).then(res=>{
						nextItem.googleDriveUploading=false;
						nextItem.googleDriveFileId=res.id;
						onQueueItemUpdated(nextItem);
						saveCurrentQueue();							
						processQueue();	
					}).catch(err=>{
						nextItem.googleDriveUploading=false;
						nextItem.googleDriveUploadingError=err;
						onQueueItemUpdated(nextItem);
						saveCurrentQueue();							
						processQueue();	
					})
				}				
				console.log(nextItem);
				onQueueItemUpdated(nextItem);
				saveCurrentQueue();							
				processQueue();	
			});	
			nextItem.pid=childProcess.pid;
			saveCurrentQueue();		
			onQueueItemUpdated(nextItem);
			//console.log('childProcess', childProcess);
			const stdoutFile='./logs/'+nextItem.id+'_log.txt';
			const stderrFile='./logs/'+nextItem.id+'_err.txt';
			let stdoutStream = fs.createWriteStream(stdoutFile);
			let stderrStream = fs.createWriteStream(stderrFile);
			
			childProcess.stdout.pipe(stdoutStream, {end: false});
			childProcess.stderr.pipe(stderrStream, {end: false});
			childProcess.stdout.pipe(process.stdout);
			childProcess.stderr.pipe(process.stderr);
			
			logStreams[nextItem.id]={stdoutStream:childProcess.stdout, stderrStream:childProcess.stderr};	
			
			let stdoutEnded = false, stderrEnded = false;
			function tryClosingStdout(){ if(stdoutEnded){ stdoutStream.end(); } }
			function tryClosingStderr(){ if(stderrEnded){ stderrStream.end(); } }
			childProcess.stdout.on('end', function(){ stdoutEnded = true; tryClosingStdout(); });
			childProcess.stderr.on('end', function(){ stderrEnded = true; tryClosingStderr(); });
			/*
			if (fs.existsSync('./'+destFilePath)){
				nextItem.status='success';
			}
			else {
				nextItem.status='error';
			}*/
			
			
		}
	}
	run();
}
//apiQuery

//apiQuery
router.get('/gnApiQuery', async(req, res, next)=>{
	
});

router.get('/units', async(req, res, next)=>{
	const db=req.query.db || 'new';
	const myPool =  mysql.createPool({
		...dbConfig,
		database: 'greenninja_'+db
	  });
	const modelIds=[11, 9, 19];
	let models=(await dbQuery([
		'SELECT model_id, display_name, unit_id FROM `model` t',
		'WHERE t.`model_id` IN ('+modelIds.join(',')+')'
	], [], myPool));
	//console.log(models);
	models=_.sortBy(models, m=>m.display_name);
	
	await asyncForEach(models, async(model)=>{
		model.units=(await dbQuery([
			'SELECT unit_id FROM `unit` t',
			'WHERE t.`unit_id` IN ('+model.unit_id+')'
		], [], myPool));
		model.units.forEach(unit=>{
			unit.number=model.unit_id.split(',').indexOf(unit.unit_id+"")+1;
			unit.model_id=model.model_id;
		});
		model.units=_.sortBy(model.units, u=>u.number);
	});
	const modelUnits=[];
	models.forEach(model=>{
		model.units.forEach(unit=>{
			modelUnits.push({val:model.model_id+'_'+unit.unit_id, label:model.display_name+' Unit '+unit.number})
		})
	});
	res.json(models);
});

router.get('/res-files', async(req, res, next)=>{
	//console.log(req);
	const resPath='./result';
	let pdfs=[];
	fs.readdirSync(resPath).forEach(file=>{
		const stats=fs.lstatSync(resPath+'/'+file);
		//console.log(file, stats);
		const nameArr=file.split('.');
		const ext=nameArr.splice(nameArr.length-1, 1)[0];
		if (ext==='pdf'){
			const qItem=_.sortBy(queue, q=>-q.updatedAt).find(q=>q.fileName===file);
			if (!qItem || (qItem && qItem.status!=='error')){
				pdfs.push(_.extend(_.cloneDeep(qItem),{
					fileName: file,
					updatedAt: stats.mtime,
					size: filesize(stats.size),
					stats,
					url: req.headers.host+'/result/'+file
				}))
			}
			
		}
	});
	pdfs=_.sortBy(pdfs, f=>f.filename);
	res.json(pdfs);
});

router.get('/worksheet', async(req, res, next)=>{
	const resPath='./tmp/pptx-export';
	let pdfs=[];
	fs.readdirSync(resPath).forEach(file=>{
		const stats=fs.lstatSync(resPath+'/'+file);
		//console.log(file, stats);
		const nameArr=file.split('.');
		const ext=nameArr.splice(nameArr.length-1, 1)[0];
		if (stats.isDirectory()){
			pdfs.push({
				filename: file,
				date: moment(stats.mtime).format('L LT'),
				size: filesize(stats.size),
				//stats
			})
		}
	});
	pdfs=_.sortBy(pdfs, f=>f.filename);
	res.json(pdfs);
});

router.delete('/worksheet/:filename', async(req, res, next)=>{
	console.log(req.params);
	const filename=req.params.filename;
	if (!filename){
		res.json({});
	}
	const srcPath='./tmp';
	const resPath='./tmp/pptx-export';
	let pdfs=[];
	
	let imgInfoLog=fs.existsSync(imgInfoJogPath) ? require(imgInfoJogPath) : {};
	const saveImgLog=()=>{
		fs.writeFileSync(imgInfoJogPath, JSON.stringify(imgInfoLog, null, 4), 'UTF-8');
	}
	
	_.keys(imgInfoLog).filter(key=>key.indexOf('/pptx-export/'+filename+'/')>0).forEach(key=>{
		delete imgInfoLog[key];
	});
	saveImgLog();	
	
	fs.readdirSync(srcPath).filter(file=>file.indexOf(filename+'.')===0).forEach(file=>{
		fs.unlinkSync(srcPath+'/'+file);
	});
	
	fs.readdirSync(resPath).filter(file=>file===filename).forEach(file=>{
		rimraf.sync(resPath+'/'+file);
	});	

	res.json({});
});

router.delete('/worksheet', async(req, res, next)=>{
	console.log(req.params);
	const srcPath='./tmp';
	const resPath='./tmp/pptx-export';
	
	shell.exec('rm -f ./tmp/*');
	shell.exec('rm -rf ./tmp/pptx-export/*');

	res.json({});
});

router.get('/queue', async(req, res, next)=>{	
	console.log('/queue')
	res.json(queue.filter(item=>!item.hidden));
});

router.post('/queue', bodyParser.json(), async(req, res, next)=>{
	console.log(req.body);
	//queue=loadQueue();
	const items=req.body.items.map(item=>{
		return {
			id: nanoid(),
			type: req.body.type,
			db: item.state.db,
			state: item.state.id,
			params: item,
			status: 'pending',
			createdAt: new Date().valueOf(),
			updatedAt: new Date().valueOf(),
		}
	});

	items.forEach(item=>{
		queue.filter(qItem=>qItem.type===item.type && JSON.stringify(qItem.params)===JSON.stringify(item.params)).forEach(qItem=>qItem.hidden=true);	
		queue.push(item);
	})
	saveCurrentQueue();
	onQueueItemsAdded();
	res.json(queue);
	processQueue();
});

router.delete('/queue/:id', async(req, res, next)=>{
	console.log(req.params);
	const item=queue.find(item=>item.id===req.params.id);
	if (item && item.status!=='inProgress'){
		if (item.pid){
			shell.exec('kill '+item.pid);
			onQueueItemUpdated(item);
		}
		else {
			queue=_.without(queue, item);	
		}
		saveCurrentQueue();	
	}	
	else if (item && item.status==='inProgress') {
		console.log('Cancel request', item);
		if (item.pid){
			shell.exec('kill '+item.pid);
			onQueueItemUpdated(item);
		}
	}
	res.json(queue);
});

router.get('/queue/:id', async(req, res, next)=>{
	console.log(req.params);
	const item=queue.find(item=>item.id===req.params.id);
	//logStreams[nextItem.id]={stdoutStream, stderrStream}

	if (logStreams[item.id] && item.status==='inProgress'){
		logStreams[item.id].stdoutStream.pipe(res);
	}
	else if (item && fs.existsSync('./logs/'+item.id+'_log.txt')) {
		const readStream=fs.createReadStream('./logs/'+item.id+'_log.txt').pipe(res);
	}
	
});

router.get('/pdf-image/:pdfName/:page', async(req, res, next)=>{
	console.log(req.params);
	let {pdfName, page}=req.params;
	pdfFolderName=pdfName.replace(/ /gi, '-');
	const fileName=pdfFolderName.replace('.pdf', '');
	const noPagePath='./tmp/pptx-export/'+pdfFolderName+'/'+fileName+'.png';
	const path='./tmp/pptx-export/'+pdfFolderName+'/'+fileName+'-'+page+'.png';
	if (!fs.existsSync(path)){
		const pdfFilePath=await downloadFile('https://app.greenninja.org/getWordDoc?path=/uploads/lessons/'+pdfName);
		await convertPptxPdf(pdfFilePath, {
			fileName:pdfFolderName
		});
	}
	fs.createReadStream(fs.existsSync(path) ? path : noPagePath).pipe(res);
});

router.ws('/queue-ws', (ws, req) => {
	//console.log(ws);
	socketClients.push(ws);
	ws.on('message', function(msg) {
		ws.send(msg);
		console.log(ws.clients);
	});
	ws.on('close', function() {
		socketClients=_.without(socketClients, ws);
    });
	console.log('socket', req.testing);
});

router.get('/item-bank', async(req, res, next)=>{
	const {grade, unit, chapter=''}=req.query;
	
	const fileName=`item-bank_${grade}.${unit}${chapter ? '.'+chapter : ''}.pdf`	
	if (!fs.existsSync('./item-bank/'+fileName)){
		shell.exec(`node item-bank-output.js --grade-num=${grade}  --unit-num=${unit}  --chapter-num=${chapter} `);
	}
	console.log(`node item-bank-output.js --grade-num=${grade}  --unit-num=${unit}  --chapter-num=${chapter} `);
	return res.sendFile(__dirname+`/item-bank/${fileName}`);

});


 
router.get('/queue/info/:id', async(req, res, next)=>{
	console.log(req.params);
	const item=queue.find(item=>item.id===req.params.id);
	const path='./logs/'+item.id+'.json';

	if (!fs.existsSync(path)){
		return res.json([]);
	}

	res.json(JSON.parse(fs.readFileSync(path, 'utf-8')));
	
});

module.exports = router;

queue.filter(item=>item.status==='inProgress').forEach(item=>item.status='error');
saveCurrentQueue();

processQueue();


