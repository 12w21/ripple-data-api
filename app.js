
/**
 * Module dependencies.
 */

var express = require('express'),
    extend = require('extend'),
    fs = require('fs'),
    winston = require('winston'),
    config = require('./config'),
    routes = require('./routes'),
    api = require('./routes/api'),
    model = require('./model'),
    interp = require('./interpreter');

var _ = require('lodash');

var Range = require('./range').Range;

var app = module.exports = express();

// Ripple client
var ripple = require('ripple-lib');
var remote = ripple.Remote.from_config(config.remote);

// MySQL
var mysql = require('mysql');
var db = mysql.createConnection({
  host: config.db.mysql_ip,
  user: config.db.mysql_user,
  password: config.db.mysql_pass,
  database: config.db.mysql_db,
  multipleStatements: true
});

// Historic data processor
var Processor = require('./processor').Processor;
var processor = new Processor(db, remote);

// News data
var News = require('./news').News;
var news = new News(db, remote);

// Configuration
var http_config = {};
app.configure(function(){
  extend(http_config, {
    ssl: false,
    port: 3000
  });
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon(__dirname + '/public/img/icon/favicon.ico'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/public'));
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  extend(http_config, {
    ssl: {
      key: fs.readFileSync('./ssl/server.key'),
      cert: fs.readFileSync('./ssl/server.crt')
    },
    port: 443
  });
  app.use(express.errorHandler());
});

var server = http_config.ssl ?
      require('https').createServer(http_config.ssl, app) :
      require('http').createServer(app);

// Hook Socket.io into Express
var io = require('socket.io').listen(server);
io.set('log level', 1);

// Routes

app.get('/', routes.index);
app.get('/partials/:name', routes.partials);

// JSON API

app.get('/api/name', api.name);
app.get('/api/market/:first/:second/hourly.json', api.market_hourly(db));
app.get('/api/market/:first/:second/daily.json', api.market_daily(db));
//Intraday
app.get('/api/intraday/:first/:second/intraday.json', api.intraday_trade(db));
//Caps
app.get('/api/caps/:first/caps.json', api.caps_currency(db));
//News
app.get('/api/news/:first/news.json', api.news_data(db));
//# of Transactions
app.get('/api/transactions/transactions.json', api.transactions_data(db));


// redirect all others to the index (HTML5 history)
app.get('*', routes.index);

// Start server

model.broadcast = function (method, data) {
  io.sockets.emit(method, data);
};

io.sockets.on('connection', function (socket) {
  socket.emit('apply', model.data);
});

remote.on('error', function (err) {
  winston.error(err);
});

remote.on('transaction_all', function (e) {
  //interp.applyTransaction(model, e);
});

_.transaction = [];

remote.on('transaction', function (e) {
  var transaction_ledger = e.ledger_index,
      transaction_account = e.transaction.Account,
      transaction_type = e.transaction.TransactionType,
      transaction_id = e.transaction.hash;
  switch (e.transaction.TransactionType) {
    case 'Payment':
      var amount = ripple.Amount.from_json(e.transaction.Amount);
      transaction_desc = transaction_account + " sent " + amount.to_number() + " " + amount.currency().to_json() + " to " + e.transaction.Destination;
      break;

    case 'TrustSet':
      transaction_desc = transaction_account + " trusts " + ripple.Amount.from_json(e.transaction.LimitAmount).to_number() + " " + e.transaction.LimitAmount.currency + " to " + e.transaction.LimitAmount.issuer;
      break;

    case 'OfferCreate':
      if (e.transaction.TakerGets.issuer !== undefined)
        transaction_desc = transaction_account + " created an offer " + ripple.Amount.from_json(e.transaction.TakerPays).to_number() + " for " + e.transaction.TakerGets.issuer;
      else
        transaction_desc = transaction_account + " created an offer " + ripple.Amount.from_json(e.transaction.TakerGets).to_number() + " for " + e.transaction.TakerPays.issuer;
      break;

    case 'OfferCancel':
      transaction_desc = transaction_account + " cancelled an offer ";
      break;

    default:
      transaction_desc = "";
  }
  _.transaction.unshift([transaction_ledger, transaction_account, transaction_type, transaction_id, transaction_desc]);
  model.apply({transaction:  _.transaction});
});

remote.on('ledger_closed', function (e) {
  winston.info('LEDGER CLOSE ' + e.ledger_index + ' ' + e.validated_ledgers);

  var status_ledger = false, vrange;
  if ("string" === typeof e.validated_ledgers) {
    vrange = Range.from_string(e.validated_ledgers);
    status_ledger = vrange.is_member(config.net.genesis_ledger);
  }

  model.apply({
    ledger_hash: e.ledger_hash,
    ledger_index: e.ledger_index,
    ledger_time: ripple.utils.toTimestamp(e.ledger_time),
    status_ledger: status_ledger
  });

  if (vrange instanceof Range) processor.processValidated(vrange);
  processor.updateAggregates();
});

remote.on('connected', function(connection) {
  winston.info('WebSocket client connected');

  model.apply({
    status_connected: true
  });

  news.getRss();
  news.getLatestNews();
  processor.loadState();

  /*
  remote.request_ledger(32570, "full")
    .on('error', function (err) {
      console.error(err);
    })
    .on('success', function (e) {
      console.log(e);
      interp.applyLedger(model, e);
      processor.loadState();
    })
    .request();
  */
});

remote.on('disconnected', function(connection) {
  model.apply({
    status_connected: false
  });
});

startupHttp();

function startupHttp()
{
  server.listen(http_config.port, function(){
    winston.info("Express server listening on port %d in %s mode",
                this.address().port, app.settings.env);

    startupMysql();
  });
}

function startupMysql()
{
  db.connect(function (err) {
    if (err) {
      winston.error(err);
      process.exit(1);
    }

    winston.info("Connected to MySQL server");
    startupRipple();
  });
}

function startupRipple()
{
  remote.connect();
}
