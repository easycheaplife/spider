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
var h_weibo = 'h_weibo';

function spider(url,cb){
	phantom.create([proxy_config,'--ignore-ssl-errors=yes','--load-images=false']).then(ph => {
		_ph = ph;
		return _ph.createPage();
	}).then(page => {
		_page = page;
		return _page.open(url);
	}).then(status => {
		return _page.property('content')
	}).then(content => {
		parse_html(url,content,function(reply){
			_ph.exit();
			_page.close();
			cb();	
		});
	});
}

function spider_sync(url,cb){
	async.waterfall([
			function(callback){
				phantom.create([proxy_config,'--load-images=false']).then(ph => {
					_ph = ph;
					return _ph.createPage();
				}).then(page => {
					_page = page;
					return _page.open(url);
				}).then(status => {
					return _page.property('content')
				}).then(content => {
					parse_html(url,content,function(reply){
						_ph.exit();
						_page.close();
						callback(null);
					});
				});
			},
			function(callback){
				callback(null);
			}],
			function(err,result){
				if(err){
					console.err(err);
				}	
				cb();
			});
}

function parse_html(url,data,cb){
	var $ = cheerio.load(data,{decodeEntities: false}); 
	var res = new Object();
	$(".WB_cardwrap.S_bg2.clearfix").each(function(i,e){
		var obj = new Object();
		obj.base_url = url;
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
		if(obj.msgUrl){
			res[obj.msgUrl] = JSON.stringify(obj);
		}
	});
	if(JSON.stringify(res) != '{}'){
		hmset(res,cb);	
	}else{
		cb(null);	
	}
}

function hset(key,val,cb){
	redis_pools.execute('pool_1',function(client, release){
		client.hset(h_weibo,key,val,function (err, reply){
			if(err){
				console.error(err);
			}
			cb(reply);
			release();
		});
	});
}

function hmset(args,cb){
	redis_pools.execute('pool_1',function(client, release){
		client.hmset(h_weibo,args,function (err, reply){
			if(err){
				console.error(err);
			}
			cb(reply);
			release();
		});
	});
}

function hget(key,cb){
	redis_pools.execute('pool_1',function(client, release){
		client.hget(h_weibo,key,function (err, reply){
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
				var base_url = 'http://s.weibo.com/weibo/' + encodeURIComponent(keywords) + '&Refer=STopic_box';
				console.log(base_url);
				spider_sync(base_url,function(){
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

process.on('uncaughtException', function (err) {
	if(0){
		console.error(err.stack);
	}
});

/*
 * test
spider('http://s.weibo.com/weibo/%25E6%258C%2582%25E5%258F%25B7',function(){});
spider('http://s.weiru.com/weibo/%25E6%258C%2582%25E5%258F%25B7&page=2',function(){});
hset('abc','def',function(result){});

var args1 = {'key1':'val1','key2':'val2'};
var args2 = ['key1','val1','key2','val2'];

var obj = new Object();
console.log(obj);
if(JSON.stringify(obj) == '{}'){
	console.log('null');
}else{
	console.log('not null');
}

obj[args1.key1] = 'test';
hmset(args2,function(){});
*
*/
start_cluster();
