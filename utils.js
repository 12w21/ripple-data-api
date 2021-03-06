var  _   = require('lodash'),
  moment = require('moment');
  
/**
 *  gatewayNameToAddress translates a given name and, 
 *  optionally, a currency to its corresponding ripple address or
 *  returns null
 */

exports.gatewayNameToAddress = function ( name, currency ) {


  var gatewayAddress = null;

  _.each(gatewayList, function(entry){
   

    if (entry.name.toLowerCase() === name.toLowerCase()) {
    
      if (currency) {

        _.each(entry.accounts, function(acct){

          if (acct.currencies.indexOf(currency) !== -1) {
            gatewayAddress = acct.address;
          }
        });

      } else {
         gatewayAddress = entry.accounts[0].address;
      }
    }

  });

  return gatewayAddress;
}
 

/**
 *  getGatewayName returns the name
 *  of a known gateway that matches the given address
 */ 
 
exports.getGatewayName = function (address) {
  for (var g = 0; g < gatewayList.length; g++) {

    if (_.find(gatewayList[g].accounts, function(account) {return account.address === address;})) {
      return gatewayList[g].name;
    }
  }

  return '';
}

/**
 *  getGatewaysForCurrency takes a currency and returns
 *  an array of gateways that issue that currency
 *  returns an empty array if the currency is invalid
 */
exports.getGatewaysForCurrency = function( currName ) {

  var issuers = [];
  gatewayList.forEach(function(gateway){
    gateway.accounts.forEach(function(acct){
      if (acct.currencies.indexOf(currName.toUpperCase()) !== -1) {
        issuers.push({
          account: acct.address,
          name: gateway.name
        });
      }
    });
  });

  return issuers;

}


/**
 *  getCurrenciesForGateway returns the currencies that that gateway handles
 */
exports.getCurrenciesForGateway = function ( name ) {
  var currencies = [];
  gatewayList.forEach(function(gateway){
    if (gateway.name.toLowerCase() === name.toLowerCase()) {
      gateway.accounts.forEach(function(account){
        currencies = currencies.concat(account.currencies);
      });
    }
  });
  return currencies;
}

exports.getHotWalletsForGateway = function( name ) {
  var hotwallets = [];
  gatewayList.forEach(function(gateway){
    if (gateway.name.toLowerCase() === name.toLowerCase()) {
      hotwallets = gateway.hotwallets;
    }
  });
  return hotwallets;
}

exports.parseTimeRange = function (time1, time2, descending) {

  var startTime, endTime;

  if (time1) {
    if (!moment(time1).isValid()) {
      return { error: 'invalid startTime: ' + time1 + ', please provide a Moment.js readable timestamp'};
    }

    startTime = moment(time1).utc();
  } 
  
  if (time2) {
    if (!moment(time2).isValid()) {
      return { error: 'invalid endTime: ' + time2 + ', please provide a Moment.js readable timestamp'};
    }

    endTime = moment(time2).utc();
  } 

  if (startTime && endTime) {
    if (endTime.isBefore(startTime)) { //swap times
      var tempTime = startTime;
      startTime    = endTime;
      endTime      = tempTime;
    }
  } else if (startTime) {
    endTime = moment.utc();
    
  } else if (endTime) {
    startTime = endTime;
    endTime   = moment.utc();
    
  } else {
    startTime = moment.utc(0);
    endTime   = moment.utc(99999999999999);    
  }

  if (descending) {  //swap times
    var tempTime = startTime;
      startTime  = endTime;
      endTime    = tempTime;
  }
  
  return {start:startTime, end:endTime};  
}

exports.parseTimeIncrement = function (inc) {
  var results = {};
  
  if (inc) {
      inc  = inc.toLowerCase().slice(0, 2),
      levels = ['ye', 'mo', 'da', 'ho', 'mi', 'se']; // shortened to accept 'yearly' or 'min' as well as 'year' and 'minute'
    
    if (inc === 'al') {

      results.group = false;

    } else if (inc === 'we') {

      results.group_multiple = group_multiple * 7; // multiply by days in a week
      results.group_level    = 2; // set group_level to day

    } else if (levels.indexOf(inc) !== -1) {

      results.group_level = levels.indexOf(inc);

    } else {

      results.group = false;
    } 
  } else {

    results.group = false;
  }
  
  return results;
}
