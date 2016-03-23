var phantom = require("phantom");
var async = require('async');
var iconv = require('iconv-lite');
var cheerio = require("cheerio");

var config_json = require('./disease');
var cluster = require("cluster");
var redis_pools = require('./redis_pools');
var redis_config = require('./redis');
var proxy_config = require('./proxy');
redis_pools.configure(redis_config);

var _ph, _page, _outObj;
var proxy_config = '--proxy=' + proxy_config.proxy_ip;

function spider(url,cb){
	phantom.create([proxy_config,'--load-images=false']).then(ph => {
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
		parse_html(content);
		_ph.exit();
		_page.close();
		cb();	
	});
}

function spider_sync(url,cb){
	async.waterfall([
			function(callback){
				phantom.create([proxy_config,'--load-images=false']).then(ph => {
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
					parse_html(content);
					if(1){
						callback(null,_ph);
					}else{
						_ph.exit();
					}
					_page.close();
				});
			},
			function(ph,callback){
				cb(ph);
			}],
			function(err,result){
				if(err){
					console.err(err);
				}	
			});
}

function parse_html(data){
	var $ = cheerio.load(data,{decodeEntities: false}); 
	var obj = new Object();
	$(".WB_cardwrap.S_bg2.clearfix").each(function(i,e){
		var weibocontent = $(e).find(".comment_txt").text();			
		var jumpUrl = $(e).find(".feed_from.W_textb").children();
		var userUrl = $(e).find(".face > a").attr("href");
		var mid = "";
		mid = $(e).find("div").attr("mid");
		if(jumpUrl.length == 2){
			var a1 = $(jumpUrl[0]);
			var a2 = $(jumpUrl[1]);
			obj.msgUrl = a1.attr("href");  
			obj.createDate = a1.attr("date");
			obj.platform = a2.text();
		}
		if(jumpUrl.lengt == 1){
			var a1 = $(jumpUrl[0]);
			obj.msgUrl = a1.attr("href");  
			obj.createDate = a1.attr("date");
		}
		var cleancontent= weibocontent.replace(/\n\s*\n/g, '\n');
		cleancontent = cleancontent.replace(/\n\s*\n\s*\n/g, '\n\n');
		obj.cleancontent = cleancontent.replace(/^\s+/, '').replace(/\s+$/, '');

		console.log("%j",obj);
		hset(obj.msgUrl,JSON.stringify(obj),function(){});	
	});
}

function hset(key,val,cb){
	redis_pools.execute('pool_1',function(client, release){
		client.hset('h_weibo',key,val,function (err, reply){
			if(err){
				console.error(err);
			}
			cb(reply);
			release();
		});
	});
}


function start(){
		var count = 0;
		var end = 0;
		var total = config_json.length;
		end = total;
		async.whilst(
			function () { return count < total; },			
			function (callback) {
				var keywords = config_json[count].name;
				var base_url = 'http://s.weibo.com/weibo/' + encodeURIComponent(keywords) + '&Refer=STopic_box';
				console.log(base_url);
				spider(base_url,function(){
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

function start_cluster(){
	var cpuCount = require('os').cpus().length;
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
					console.log('continue');
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

//spider('http://s.weibo.com/weibo/%25E6%258C%2582%25E5%258F%25B7',function(){});
//spider('http://s.weibo.com/weibo/%25E6%258C%2582%25E5%258F%25B7&page=2',function(){});
//hset('abc','def',function(result){});

start();
