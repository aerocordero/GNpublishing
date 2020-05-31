const fs = require('fs');
const http = require('https');
const _ = require('lodash');
const Jimp = require('jimp');
const mysql = require('mysql2');
const hasha = require('hasha');
const config = require('../config.json');

const pool =  mysql.createPool(config.db);
const db=pool.promise();

const dbQuery=async (query, params)=>{
	const queryStr=query.join(' ');
	const tmpdest=__dirname+'/../tmp/'+hasha(queryStr+JSON.stringify(params)).substr(0, 10)+'.json';
		
	if (fs.existsSync(tmpdest)){
		return require(tmpdest);
		return;
	}
	
	const res=(await db.query(query.join(' '), params))[0];
	fs.writeFileSync(tmpdest, JSON.stringify(res, null, 4));
	return res;
}

const decodeHtml=(str)=>
{
	var map =
	{
		'&amp;': '&',
		'&lt;': '<',
		'&gt;': '>',
		'&quot;': '"',
		'&#039;': "'",
		'&nbsp;': " ",
		'&rsquo;':'’',
		'&ndash;': '—'
	};
	return str.replace(new RegExp(_.keys(map).join('|'), 'g'), function(m) {return map[m];});
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
	await callback(array[index], index, array);
  }
}

const downloadFile=(url)=>{
	return new Promise((success, error)=>{
		//url=url.replace('https', 'http');
		
		const urlArr=url.split('/');
		const filename=urlArr[urlArr.length-1];
		const dest='tmp/'+filename;
		
		if (fs.existsSync(dest)){
			success(dest);
			return;
		}
		
		var filestream = fs.createWriteStream(dest);

		var request = http.get(url, function(response) {
			response.pipe(filestream);
		});

		filestream.on('finish', function() {
			filestream.close();  // close() is async, call cb after close completes.
			success(dest);
		});

		// check for request error too
		request.on('error', function (err) {
			console.log(err);
			//fs.unlink(dest);
			error(err);
		});

		filestream.on('error', function(err) { // Handle errors
			console.log(err);
			//fs.unlink(dest); // Delete the file async. (But we don't check the result)
			error(err);
		});
	})
}

const convertImage=async (path, toFormat)=>{
	const pathArr=path.split('.');
	const ext=pathArr[pathArr.length-1];
	
	const newName=path.replace('.'+ext, '.'+toFormat);
	
	const res=await Jimp.read(path)
	  .then(img => {
		console.log(img);
		return img
		  //.resize(256, 256) // resize
		  //.quality(60) // set JPEG quality
		  //.greyscale() // set greyscale
		  .write(newName); // save
	  })
	  .catch(err => {
		console.error(err);
	  });
	console.log(res);
	return newName;
}

const imageInfo=async (path)=>{		
	const img=await Jimp.read(path);
	//console.log(JSON.stringify(res, null, 4));
	return img.bitmap;
}

const getImgPropHeigth=(img, width)=>{
	return width*img.height/img.width;
}

module.exports = {
	decodeHtml,
	asyncForEach,
	downloadFile,
	convertImage,
	imageInfo,
	getImgPropHeigth,
	dbQuery
};