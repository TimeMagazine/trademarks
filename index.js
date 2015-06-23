var downcache = require("downcache"),
	request = require("request"),
	cheerio = require("cheerio"),
	urlparse = require("url"),
	log = require("npmlog"),
	fs = require("fs"),
	http = require('http-get'),
	d3 = require("d3");

http://tmsearch.uspto.gov/bin/gate.exe?f=brwsidx&state=4802:gpgd3t.1.1

// params imputed from URLs and error messages
var BASE = "http://tmsearch.uspto.gov",
	ENDPOINT = BASE + "/bin/showfield",
	params = {
		f: "toc",
		p_plural: "yes",
		p_search: "searchstr",
		a_default: "search",
		a_search: "Submit Query",
		p_d: "trmk",	
		"p_tagrepl~:": "PARA1$DD",
		p_lang: "english",
		p_L: 25
	};

var format = d3.time.format("%B %d, %Y"),
	fmt = d3.time.format("%b. %d, %Y");

module.exports = function(searchterm, N) {
	N = N || 25;
	params.p_s_PARA1 = searchterm;
	params.p_L = N;

	var url = ENDPOINT + urlparse.format({query: params });

	parse(url, searchterm);
}

function getResults(url, searchterm) {
	log.info(url);

	request(url, function(err, resp, body) {
		fs.writeFileSync("test.html", body);

		var $ = cheerio.load(body),	
			results = $("td:nth-child(4) a");

		var nxt = $("a [src='/webaka/icon/reg/list_n.gif']").parent().attr("href");

		if (nxt) {
			nxt = BASE + nxt;
		} else {
			nxt = null;
		}

		getResult(searchterm, results, 0, nxt);
	});
}

// needs to be sync 
function getResult(searchterm, results, N, nxt, force) {
	if (N >= results.length) {
		console.log(nxt);
		if (nxt) {
			//parse(nxt, searchterm);
		}
		return;
	}
	downcache(BASE + results[N].attribs.href, 
		{
			path: searchterm.replace(/"/g, "") + "_" + results[N].attribs.href.split(".").slice(1).join("_") + ".html",
			force: force,
			include_response: true
		},
		function(body, resp) {
			var sz = resp.socket ? parseInt(resp.socket.bytesRead, 10) : 10000;
			if (sz < 5000) {
				console.log("retrying", N);
				setTimeout(function() {
					getResult(searchterm, results, N, nxt, true);
				}, 1000);				
			} else {
				setTimeout(function() {
					getResult(searchterm, results, N+1, nxt, false);
				}, 1000);				
			}
		}
	);
}

//function cachePage(u)

var parseResult = module.exports.parse = function(searchterm, N) {
	var filepath = "./cache/" + searchterm.replace(/"/g, "") + "_1_" + N + ".html";
	var body = fs.readFileSync(filepath, "utf8");
	$ = cheerio.load(body);

	var table = $("table")[3],
		data = {};

	data.permalink = $("img[src='/webaka/icon/reg/tsdr.gif']").parent().attr("href");

	$(table).find("tr").each(function(i, v) {
		var prop = $($(v).find("td")[0]).text().trim().toLowerCase().replace(/ /g, "_");
		var val = $($(v).find("td")[1]).text().trim();
		data[prop] = val;
	});

	var date_fields = ['filing_date', 'published_for_opposition', 'registration_date', 'cancellation_date', 'abandonment_date'];

	date_fields.forEach(function(df) {
		if (data[df]) {
			data[df] = format.parse(data[df]);
		}
	});

	data._id = data.serial_number;

	//fs.writeFileSync(searchterm.replace(/"/g, "") + "_1_" + N + ".json", JSON.stringify(data, null, 2));
	return data;
}

function parseCodes(s) {
	var pattern = /(\d+\.\d+\.\d+) - \s+/g,
		pieces = s.split(pattern),
	    data = {};

	for (var c = 1; c < pieces.length; c += 2) {
	    if (pieces[c+1]) {
	        data[pieces[c]] = pieces[c+1].replace(/\s+/g, " ");
	    }
	}
	return data;
}

var getImage = module.exports.image = function(sn) {

	if (fs.existsSync("./img/" + sn + '.jpg')) {
		console.log("already got", sn);
		return;
	}
	http.get({ url: "http://tsdr.uspto.gov/img/" + sn + "/large" }, "./img/" + sn + '.jpg', function (error, result) {
		if (error) {
		    log.error(error);
		} else {
		    log.verbose('File downloaded for ' + sn);
		}
	});	
}

var getPermalink = module.exports.permalink = function(sn, callback) {
	var url = "http://tsdr.uspto.gov/statusview/sn" + sn;

	downcache(url, {
		path: sn + ".html",
		sync: 0
	}, function(body) {
		var data = {
			dates: []
		};
		var $ = cheerio.load(body);



		$("#sumary-section .key").each(function(i, v) {
			var key = $(v).text().trim().toLowerCase().replace(/:$/, "");
			var val = $(v).next().text().trim();

			if (key.indexOf("date") != -1) {
				var dt = fmt.parse(val) || format.parse(val) || null;
				if (!dt) {
					console.log(val, sn);
				} else {
					val = dt;
				}
			}

			if (key != "") {
				data[key.replace(/\s/g, "_")] = val;
			}
		});

		$(".expand_wrapper").each(function(i, v) {
			var category = $(v).find("h2").text().trim().toLowerCase().replace(/ /g, "_"),
				set = {};

			$(v).find(".key").each(function(ii, vv) {
				var key = $(vv).text().trim().toLowerCase().replace(/:$/, "");
				var val = $(vv).next().text().trim();

				if (key.indexOf("date") != -1) {
					var dt = fmt.parse(val) || format.parse(val) || null;
					if (!dt) {
						//console.log(val, sn);
					} else {
						val = dt;
					}
				}

				if (key == "design search code(s)") {
					val = parseCodes(val);
				}

				if (key != "") {
					set[key.replace(/\s/g, "_")] = val;
				}
			});

			if (set != {}) {
				data[category] = set;
			}
		});

		$("table tr").each(function(r, row) {
			var val = $(row).find("td:nth-child(1)").text().trim();
			var dt = fmt.parse(val) || format.parse(val) || null;
			//console.log(val, dt);
			if (dt) {
				data.dates.push([
					dt,
					$(row).find("td:nth-child(2)").text().trim()
				]);
			}
		});


		data._id = sn;
		callback(data);
	});


}
