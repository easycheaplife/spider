var phantom = require("phantom");
var async = require('async');
var config_json = require('./disease.json');
var cluster = require("cluster");

var _ph, _page, _outObj;

function spider(url,cb){
	phantom.create(['--proxy=125.39.225.4:18003','--load-images=false']).then(ph => {
		_ph = ph;
		console.log('step 1');
		return _ph.createPage();
	}).then(page => {
		_page = page;
		console.log('step 2');
		return _page.open(url);
	}).then(status => {
		console.log(status);
		console.log('step 3');
		return _page.property('content')
	}).then(content => {
		console.log('step 4');
		if(1){
			console.log(content);
		}
		_page.close();
		if(1){
			cb(_ph);	
		}else{
			_ph.exit();
		}
	});
}


//spider('http://s.weibo.com/weibo/%25E6%258C%2582%25E5%258F%25B7',function(ph){});
//spider('http://s.weibo.com/weibo/%25E6%258C%2582%25E5%258F%25B7&page=2',function(ph){ph.exit()});

function start(){
	var cpuCount = require('os').cpus().length * 5;
	if (cluster.isMaster) {
		for (var i = 0; i < cpuCount; i++) {
			console.log('Forking process #' + (i + 1));
			cluster.fork();
		}
		cluster.on('exit', function (worker) {
			console.log('Worker ' + woker.id + ' died. Forking...');
			cluster.fork();
		});
	}else{
		console.log('worker id : ' + cluster.worker.id);
		var count = 0;
		var end = 0;
		var total = config_json.length;
		count = Math.floor(total / cpuCount) * (cluster.worker.id - 1) ;
		end = Math.floor(total / cpuCount) * cluster.worker.id ;
		if(cluster.worker.id == cpuCount){
			end = total;
		}
		console.log('start : ' + count + '   end : ' + end);
		async.whilst(
			function () { return count < total; },			
			function (callback) {
			
				var keywords = config_json[count].name;
				var base_url = 'http://s.weibo.com/weibo/' + keywords + '&Refer=STopic_box';
				console.log(base_url);
				spider(base_url,function(ph){
					if(ph){
						ph.exit();
					}
					++count;	
					callback(null);
				});
			},
			function (err, n) {
				if(err){
					console.log(err);
				}	
			}
		);
	}
}

start();
