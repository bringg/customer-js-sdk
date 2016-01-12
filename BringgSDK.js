/*global $:false */

'use strict';

var BringgSDK = (function () {
  var module = {};
  //========================================================================
  //
  // CONSTS
  //
  //========================================================================
  var MAX_LOCATION_POINTS_FOR_UPDATE = 50;

  var WAY_POINT_DONE_EVENT = 'way point done';
  var WAY_POINT_LOCATION_UPDATE_EVENT = 'way point location updated';
  var WAY_POINT_ETA_UPDATE_EVENT = 'way point eta updated';
  var LOCATION_UPDATE_EVENT = 'location update';
  var ORDER_UPDATE_EVENT = 'order update';
  var ORDER_DONE_EVENT = 'order done';

  var REAL_TIME_OPTIONS = {
    'END_POINT' : 'https://realtime2-api.bringg.com/',
    'SECURED_SOCKETS': true,
    'SOCKET_WEBSOCKET_PORT': 443,
    'SOCKET_XHR_PORT': 8443
  };

  //========================================================================
  //
  // PROPERTIES
  //
  //========================================================================
  var lastEta,
    etaMethod,
    driverActivity,
    timeoutForRestPoll = 30000,
    timeoutForRestIfSocketConnected = 120000,
    timeoutForETACalculation = 60000,
    lastEventTime = null,
    lastKnownLocation = null,
    locationFrames = [],
    lastETAUpdate = null,
    updateNow = false,
    counterSinceMapResize = 0,
    destination_lat,
    destination_lng,
    destination,
    watchingOrder = false,
    watchingDriver = false,
    watchingWayPoint = false,
    animationInterval = 50,
    connected = false,
    configuration,
    etaFromServer = false,
    callbacks = {
      onConnectCb: null,
      onDisconnectCb: null,
      orderUpdateCb: null,
      locationUpdateCb: null,
      etaUpdateCb: null,
      etaMethodChangedCb: null,
      driverArrivedCb: null,
      driverLeftCb: null,
      taskEndedCb: null,
      taskRatedCb: null,
      failedLoadingCb: null,
      noteAddedCb: null,
      taskPostRatedCb: null
    },
    locationFramesInterval,
    etaInterval,
    pollingInterval,
    shouldAutoWatchDriver = true,
    shouldAutoWatchWayPoint = false;

  /**
   *
   * @private
   */
  module._socket = null;

  /**
   *
   * @type {{}}
   * @private
   */
  module._credentials = {};

  //========================================================================
  //
  // PUBLIC API
  //
  //========================================================================

  /**
   * obtain customer configuration and initiate the real-time connection.
   * @param params - a dictionary of initialization params. support the following values:
   *  token, share_uuid, order_uuid
   * @param cb - [optional] a callback for initialization done.
   */
  module.initializeBringg = function (params, cb) {

    if (!params){
      console.log('cannot init without params');
      return;
    }

    module._setCredentials(params);

    // get config only if provided with share uuid
    var shareUuid = params.share_uuid;
    if (shareUuid) {
      var beforeCall = new Date();

      getShareConfig(shareUuid, function (updatedConfiguration) {
        console.log('new shared config ' + JSON.stringify(configuration));

        var afterCall = new Date() - beforeCall;
        configuration = updatedConfiguration;
        configuration.share_uuid = share_uuid;

        module._onNewConfiguration(configuration);

        customerAlert({alert_type: 7, time: afterCall});

        if (cb) {
          cb(configuration);
        }

      }, function (jqXHR, textStatus, errorThrown) {
        if (callbacks.failedLoadingCb) {
          callbacks.failedLoadingCb(textStatus);
        }
      });
    }
  };

  /**
   * initiate the real-time connection without configuration.
   * @param customerAccessToken - optional.
   * @param onConnectCb - optional.
   * @param onDisconnectCb - optional
   */
  module.connect = function(customerAccessToken, onConnectCb, onDisconnectCb){
    module._credentials.customer_access_token = customerAccessToken;
    module.setConnectionCallbacks(onConnectCb, onDisconnectCb);
    module._connectSocket();
  };

  /**
   * closes the socket connection and clear any polling tasks that are currently running.
   */
  module.disconnect =
  module.terminateBringg = function () {
    module._closeSocketConnection();

    if (locationFramesInterval) {
      clearInterval(locationFramesInterval);
    }
    if (etaInterval) {
      clearInterval(etaInterval);
    }
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    // clear only the tracking credentials since we might want to use other configs like rating url later.
    if (configuration) {
      configuration.share_uuid = null;
      configuration.order_uuid = null;
      configuration.way_point_id = null;
    }
  };

  module.isConnected = function(){
    return connected;
  };

  module.setConfiguration = function(value){
    configuration = value;
  };


  // ================================================
  // watch apis
  // ================================================

  /**
   *
   * @param params
   * @param callback
   */
  module.watchOrder = function(params, callback){
    console.log('watching order :' + JSON.stringify(params));
    module._socket.emit('watch order', params, function(result){
      module._watchOrderCb(result, callback);

      fillConfig(params);
      if (!watchingWayPoint && shouldAutoWatchWayPoint && configuration.way_point_id && configuration.order_uuid){
        module.watchWayPoint({order_uuid: configuration.order_uuid, way_point_id : configuration.way_point_id});
      }

    });
  };

  module._watchOrderCb = function(result, callback){
    if (result && result.success) {

      watchingOrder = true;

      // cache the params returned from the watch
      if (result.shared_location) {
        module.setConfiguration(result.shared_location);
        configuration.share_uuid = result.shared_location.uuid;
        module._onNewConfiguration(result.shared_location);
      }

      if (callback) {
        callback(result)
      }
    }
  };

  /**
   *
   * @param params
   * @param callback
   */
  module.watchDriver = function(params, callback){
    console.log('watching driver :' + JSON.stringify(params));
    module._socket.emit('watch driver', params, function(result){
      module._watchDriverCb(result, callback);
    });

    fillConfig(params);
  };

  module._watchDriverCb = function(result, callback){
    if (result && result.success) {
      watchingDriver = true;

      if (callback) {
        callback(result)
      }
    }
  };

  /**
   *
   * @param params
   * @param callback
   */
  module.watchWayPoint = function(params, callback){
    console.log('watching waypoint :' + JSON.stringify(params));
    module._socket.emit('watch way point', params, function(result){
      module._watchWayPointCb(result, callback);
    });
  };

  module._watchWayPointCb = function(result, callback){
    if (result && result.success) {
      watchingWayPoint = true;

      if (callback) {
        callback(result);
      }
    }
  };

  module._connectCustomer = function(){
    if (module._credentials !== {}) {
      console.log('calling connect customer with ' + JSON.stringify(module._credentials));
      module._socket.emit('customer connect', module._credentials, function (result) {
        console.log(JSON.stringify(result));
      });
    } else {
      console.log('no credentials to connect customer');
    }
  };

  // ============================================

  module.setEventCallback = function (addedCallbacks) {
    for (var callbackIdx in addedCallbacks) {
      if (callbacks[callbackIdx] === null) {
        callbacks[callbackIdx] = addedCallbacks[callbackIdx];
      }
    }
  };

  module.submitRating = function (rating) {
    if (configuration) {
      if (configuration.rating_url) {
        $.post(configuration.rating_url, {
          rating: rating,
          token: configuration.rating_token
        }, function (response) {
          if (callbacks.taskRatedCb) {
            callbacks.taskRatedCb(response);
          }
        }).fail(function () {
          if (callbacks.taskRatedCb) {
            callbacks.taskRatedCb({success: false, message: 'Unknown error while rating'});
          }
        });
      } else {
        console.log('submit rating - no url provided for rating');
        if (callbacks.taskRatedCb) {
          callbacks.taskRatedCb({success: false, message: 'no url provided for rating'});
        }
      }
    } else {
      console.log('submit rating - no configuration');
    }
  };

  module.submitRatingReason = function (ratingReasonId) {
    $.post(configuration.rating_reason.rating_reason_url, {
      rating_reason_id: ratingReasonId,
      token: configuration.rating_token
    }, function (response) {
      if (callbacks.taskPostRatedCb) {
        callbacks.taskPostRatedCb(response);
      }
    }).fail(function () {
      if (callbacks.taskPostRatedCb) {
        callbacks.taskPostRatedCb({success: false, message: 'Unknown error while submitting rating reason.'});
      }
    });
  };

  module.submitNote = function (note) {
    if (!note) {
      return;
    }
    $.post(configuration.note_url, {
      note: note,
      token: configuration.note_token
    }, function (response) {
      if (callbacks.noteAddedCb) {
        callbacks.noteAddedCb(response);
      }
    }).fail(function () {
      if (callbacks.noteAddedCb) {
        callbacks.noteAddedCb({success: false, message: 'Unknown error while sending note'});
      }
    });
  };

  /**
   *
   * @param position
   * @param successCb
   * @param failureCb
   */
  module.submitLocation = function (position, successCb, failureCb) {
    $.post(configuration.find_me_url, {
      position: position,
      find_me_token: configuration.find_me_token
    }).success(function (response) {
      if (successCb) {
        successCb(response);
      }
    }).fail(function () {
      if (failureCb) {
        failureCb();
      }
    });
  };

  /**
   *
   */
  module.submitTip = function (tip) {
    var canvas = document.getElementById('newSignature');// save canvas image as data url (png format by default)
    var blob = dataURItoBlob(canvas.toDataURL('image/jpg'));
    var fileName = guid() + '.jpg';
    $.post(configuration.tipConfiguration.tipSignatureUploadPath, {
      amount: tip,
      signatureImage: fileName,
      currency: configuration.tipConfiguration.tipCurrency,
      type: blob.type,
      tipToken: configuration.tip_token
    }, function (urlResponse) {
      $.ajax({
        url: urlResponse.url,
        type: 'PUT',
        data: blob,
        processData: false,
        contentType: blob.type
      }).success(function (res) {
        $.post(configuration.tipConfiguration.tipUrl, {
          amount: tip,
          tipToken: configuration.tip_token,
          signatureImage: fileName,
          currency: configuration.tipConfiguration.tipCurrency,
          taskNoteId: urlResponse.note_id
        }).success(function (res) {

        }).fail(function (res) {

        });
      });
    }).fail(function (res) {

    });
  };

  /**
   *
   * @returns {*}
   */
  module.getLastKnownETA = function () {
    if (etaFromServer) {
      return Math.floor((new Date(configuration.eta) - Date.now()) / 1000 / 60);
    }
    return lastEta;
  };


  module.setOrderUpdateCb = function(cb){
    callbacks.orderUpdateCb = cb;
  };

  module.setLocationUpdateCb = function(cb) {
    callbacks.locationUpdateCb = cb;
  };

  module.setETAUpdateCb = function(cb) {
    callbacks.etaUpdateCb = cb;
  };

  module.setETAMethodChangedCb = function(cb) {
    callbacks.etaMethodChangedCb = cb;
  };

  module.getETAMethod = function() {
    return etaMethod;
  };

  module.setETAMethod = function(newETAMethod) {
    etaMethod = newETAMethod;
  };

  module.setDestination = function(lat, lng){
    destination_lat = lat;
    destination_lng = lng;
    destination = new google.maps.LatLng(lat, lng);
  };

  module.setConnectionCallbacks = function(onConnectCb, onDisconnectCb){
    if (onConnectCb){
      callbacks.onConnectCb = onConnectCb;
    }
    if (onDisconnectCb){
      callbacks.onDisconnectCb = onDisconnectCb;
    }
  };

  module.setAutoWatchDriver = function(enable){
    shouldAutoWatchDriver = enable
  };

  module.setAutoWatchWayPoint = function(enable){
    shouldAutoWatchWayPoint = enable
  };

  //========================================================================
  //
  // PRIVATE
  //
  //========================================================================

  function getRealTimeEndPoint(){
    return window.MONITOR_END_POINT ? window.MONITOR_END_POINT : REAL_TIME_OPTIONS.END_POINT;
  }

  function getWebSocketPort(){
    return window.SOCKET_WEBSOCKET_PORT ? window.SOCKET_WEBSOCKET_PORT : REAL_TIME_OPTIONS.SOCKET_WEBSOCKET_PORT;
  }

  function getXHRPort(){
    return window.SOCKET_XHR_PORT ? window.SOCKET_XHR_PORT : REAL_TIME_OPTIONS.SOCKET_XHR_PORT;
  }

  function getSecuredSocketSetup(){
    return window.SECURED_SOCKETS ? window.SECURED_SOCKETS : REAL_TIME_OPTIONS.SECURED_SOCKETS;
  }


  /**
   * connect the socket and registers all connection listeners.
   * if a previous connection exists it closes it first.
   * @private
   */
  module._connectSocket = function() {
    module._closeSocketConnection();

    module._socket = io(getRealTimeEndPoint(), {
      transports: [
        {name: 'websocket', options: {port: getWebSocketPort(), secure: getSecuredSocketSetup()}},
        {name: 'polling', options: {port: getXHRPort(), secure: getSecuredSocketSetup()}}
      ]
    });

    module._socket.on('connect', module._onSocketConnected);
    module._socket.on('connecting', onSocketConnecting);
    module._socket.on('disconnect', onSocketDisconnected);
    module._socket.on('error', onSocketError);
  };

  /**
   * closes the socket connection and remove all listeners. does not disconnects later.
   * @private
   */
  module._closeSocketConnection = function(){
    if (module._socket){
      module._socket.disconnect();
      module._socket.removeAllListeners();
      module._socket = null;
    }
    watchingDriver = false;
    watchingOrder = false;
    watchingWayPoint = false;
  };

  /**
   * validates configuration and
   * @param configuration
   * @private
   */
  module._onNewConfiguration = function(configuration){

    if (configuration.expired === undefined || !configuration.expired || configuration.expired === 'false') {

      if (configuration.done === undefined || !configuration.done || configuration.done === 'false'){
        etaFromServer = configuration.eta ? true : false;

        if (configuration.destination_lat && configuration.destination_lng) {
          destination_lat = configuration.destination_lat;
          destination_lng = configuration.destination_lng;
        }
        if (configuration.destination) {
          destination = configuration.destination;
        }

        setDriverActivity(configuration.driverActivity);

        setPollingInterval();

        initETAMethod();
        setETACalcInterval();

        setLocationAnimationInterval();
      }

      if (configuration.special_features) {
        configuration.special_features.forEach(function (special_feature) {
          if (special_feature.url) {
            _loadScript(special_feature.url, function () {
            });
          }
        });
      }

      if (!connected) {
        module._connectSocket();
      }

    } else {
      module.disconnect();
    }
  };

  /**
   *
   * @param params
   * @private
   */
  module._setCredentials = function(params){
    if (params.token) {
      module._credentials.token = params.token;
    }
    if (params.customer_access_token) {
      module._credentials.customer_access_token = params.customer_access_token;
    }
  };

  // =========================================

  function calculateAbsoluteETA() {
    var d = new Date();
    d.setMinutes(d.getMinutes() + lastEta);
    var return_date = d.toLocaleTimeString(navigator.language, {hour: '2-digit', minute: '2-digit'});
    if (_isSafari()) {
      return_date = return_date.slice(0, -5).replace(/:\d\d([ ap]|$)/, '$1');
    }
    return return_date;
  }

  function initETAMethod() {
    if (configuration && configuration.consumer_app_eta_display && configuration.consumer_app_eta_display.method) {
      etaMethod = configuration.consumer_app_eta_display.method;
    }
    if (etaMethod === 'smart') {
      var eta_smart_threshold = 30;
      if (configuration && configuration.consumer_app_eta_display && !isNaN(configuration.consumer_app_eta_display.threshold)) {
        eta_smart_threshold = configuration.consumer_app_eta_display.threshold;
      }
      if (lastEta > eta_smart_threshold) {
        etaMethod = 'absolute';
        if (callbacks.etaMethodChangedCb) {
          callbacks.etaMethodChangedCb();
        }
      } else {
        etaMethod = 'countdown';
        if (callbacks.etaMethodChangedCb) {
          callbacks.etaMethodChangedCb();
        }
      }
      //default
    } else if (!etaMethod) {
      if (lastEta > 30) {
        etaMethod = 'absolute';
        if (callbacks.etaMethodChangedCb) {
          callbacks.etaMethodChangedCb();
        }
      } else {
        etaMethod = 'countdown';
        if (callbacks.etaMethodChangedCb) {
          callbacks.etaMethodChangedCb();
        }
      }
    } else {
      if (callbacks.etaMethodChangedCb) {
        callbacks.etaMethodChangedCb();
      }
    }
  }

  function setDriverActivity(newActivity) {
    driverActivity = google.maps.TravelMode.DRIVING;

    switch (newActivity) {
      case 1: //not moving
        driverActivity = google.maps.TravelMode.DRIVING;
        break;
      case 2: //walking
      case 3: //running
        driverActivity = google.maps.TravelMode.WALKING;
        break;
      case 4: // bicycle
        driverActivity = google.maps.TravelMode.BICYCLING;
        break;
      case 0: //unknown
      case 5: // driving
        driverActivity = google.maps.TravelMode.DRIVING;
        break;
    }
  }

  function customerAlert(options) {
    if (!configuration.alerting_token) {
      return;
    }

    var data = $.extend({}, {alert_type: 0, token: configuration.alerting_token}, options);

    $.post(configuration.alerting_url, data, function (response) {
      if (response.success) {
      } else {
      }
    }).fail(function () {
      console.error('Failed alerting');
    });
  }

  function setETACalcInterval(){
    etaInterval = setInterval(function () {
      if (!watchingDriver){
        console.log('eta calculation - no current tracking');
        return;
      }

      var eta = 0;
      if (lastEta && lastETAUpdate && watchingDriver) {
        if (new Date().getTime() - lastETAUpdate > 1000 * 60) {
          console.log('Over a minute since eta update, recalculating ETA');
          if (etaFromServer) {
            eta = module.getLastKnownETA();
            if (eta <= 5) {
              console.log('(eta ' + eta + ') -> Not taking from server anymore');
              etaFromServer = false;
              updateNow = true;
            }
          } else {
            if (lastEta > 1) {
              eta = lastEta - 1;
            }
          }
          if (callbacks.etaUpdateCb) {
            callbacks.etaUpdateCb(eta);
          }
        }
      }
    }, timeoutForETACalculation);

    setTimeout(function () {
      if (lastETAUpdate === null && watchingDriver) {
        console.log('no lastETAUpdate after timeout, calculating');
        calculateETA(configuration.current_lat, configuration.current_lng, destination_lat, destination_lng, destination, function () {
          customerAlert({alert_type: 1, updated_eta: lastEta, driverActivity: driverActivity});
        });
      }
    }, 3000);
  }

  function setPollingInterval(){

    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(function () {

      if (lastEventTime) {
        var timeSinceUpdate = new Date().getTime() - lastEventTime;
        var minTimeToWait = connected ? timeoutForRestIfSocketConnected : timeoutForRestPoll;
        if (timeSinceUpdate > minTimeToWait) {
          // poll order anyway
          getSharedOrder(configuration.order_uuid, configuration.share_uuid);

          // poll location only if in correct state
          if (watchingDriver) {
            getSharedLocation(configuration.share_uuid);
          }

          // do polling faster
          if (timeoutForRestPoll > 10000) {
            timeoutForRestPoll = timeoutForRestPoll - 5000;
          }

          //there was no location update using WS, fetch location update using REST
          customerAlert({alert_type: 4, last_update: timeSinceUpdate / 1000});
        }
      }
      else {
        lastEventTime = new Date().getTime();
      }
    }, timeoutForRestPoll);
  }

  function getShareConfig(uuid, callback, errorCallback){
    console.log('Getting shared config for uuid: ' + uuid);
    $.getJSON(getRealTimeEndPoint() + 'shared/' + uuid + '?full=true', callback).error(errorCallback);
  }

  function getSharedLocation(uuid){
    console.log('Getting location via REST for uuid: ' + uuid);

    $.getJSON(getRealTimeEndPoint() + 'shared/' + uuid + '/location/', function (result) {
      console.log('Rest location update: ' + JSON.stringify(result));
      if ((result.success || result.status === 'ok') && result.current_lat && result.current_lng) {
        var locationData = {
          lat: result.current_lat,
          lng: result.current_lng
        };
        onLocationUpdated(locationData);
      }
    }).error(function (jqXHR, textStatus, errorThrown) {

    });
  }

  function getOrderViaRest(orderUuid, shareUuid){
    console.log('Getting order via REST with share uuid: ' + shareUuid);
    $.getJSON(getRealTimeEndPoint() + 'watch/shared/' + shareUuid + '?order_uuid=' + orderUuid, function (result) {
      console.log('Rest order update: ' + JSON.stringify(result));
      if (result.success && result.order_update){
        module._onOrderUpdate(result.order_update);
      }
    }).error(function (jqXHR, textStatus, errorThrown) {

    });
  }

  function createShareForOrderViaRest(orderUuid){
    console.log('creating share via REST for order_uuid: ' + orderUuid);
    $.getJSON(getRealTimeEndPoint() + 'shared/orders?order_uuid=' + orderUuid, function (result) {
      console.log('Rest order update: ' + JSON.stringify(result));
      if (result.success && result.order_update){
        module._onOrderUpdate(result.order_update);
      }
    }).error(function (jqXHR, textStatus, errorThrown) {

    });
  }

  function getSharedOrder(orderUuid, shareUuid){
    // if we already have shared location
    if (orderUuid && shareUuid){
      getOrderViaRest(orderUuid, shareUuid);
    } else if (orderUuid){ // if we don't have shared location we have to watch order first
      createShareForOrderViaRest(orderUuid);
    } else {
      console.log('no shared nor order uuid for polling');
    }
  }

  // =========================================

  function setLocationAnimationInterval(){
    locationFramesInterval = setInterval(function () {
      while (locationFrames.length > 2 * MAX_LOCATION_POINTS_FOR_UPDATE) {
        locationFrames.splice(0, MAX_LOCATION_POINTS_FOR_UPDATE - 1);
      }
      var nextLocation = locationFrames.shift();

      if (nextLocation === undefined) {
        return;
      }
      if (callbacks.locationUpdateCb) {
        lastKnownLocation = nextLocation;
        callbacks.locationUpdateCb(nextLocation);
      }
      counterSinceMapResize++;

      var now = new Date().getTime();
      if (now - lastETAUpdate > 10 * 60 * 1000 || counterSinceMapResize > MAX_LOCATION_POINTS_FOR_UPDATE || updateNow) {
        var alertOnActivityChange = updateNow;
        updateNow = false;
        console.log('Updating ETA after timeout of (' + (now - lastETAUpdate) + ') with (' + counterSinceMapResize + ') and (' + updateNow + ')');
        calculateETA(nextLocation.lat(), nextLocation.lng(), destination_lat, destination_lng, destination, function () {
          if (alertOnActivityChange) {
            customerAlert({alert_type: 1, updated_eta: lastEta, driverActivity: driverActivity});
          } else {
            customerAlert({alert_type: 3, updated_eta: lastEta});
          }
        });
        counterSinceMapResize = 0;
      }
    }, animationInterval);
  }

  function onETACalculated(response, status){

  }
  function calculateETA(originLat, originLng, destLat, destLng, destAddress, onETACalculatedCallback) {
    if (!watchingDriver){
      return;
    }
    console.log('calculating ETA.. (' + originLat + ',' + originLng + ') to (' + destLat + ',' + destLng + ')');

    if (!originLat || ! originLng || !destLat || !destLng){
      return;
    }

    function callback(response, status) {
      if (response) {
        console.log('calculating ETA received (' + status + '): ', response.rows);
      }
      if (status === google.maps.DistanceMatrixStatus.OK) {
        var origins = response.originAddresses;
        var destinations = response.destinationAddresses;

        for (var i = 0; i < origins.length; i++) {
          var results = response.rows[i].elements;
          for (var j = 0; j < results.length; j++) {
            var element = results[j];
            if (['NOT_FOUND', 'ZERO_RESULTS'].indexOf(element.status) === -1) {
              //var distance = element.distance.text;
              var newEta = Math.floor(element.duration.value / 60);
              console.log('calculating ETA got ETA: ' + newEta);

              if (newEta !== lastEta) {
                lastEta = newEta;
                var from = origins[i];
                var to = destinations[j];
                if (onETACalculatedCallback) {
                  onETACalculatedCallback();
                }
                if (callbacks.etaUpdateCb) {
                  callbacks.etaUpdateCb(lastEta);
                }
              }
            } else {
              console.log('calculating ETA received (' + element.status + ') no results');
              if (callbacks.etaUpdateCb) {
                callbacks.etaUpdateCb();
              }
            }
          }
        }
      } else {
        console.log('calculating ETA received error: ' + status);
        if (callbacks.etaUpdateCb) {
          callbacks.etaUpdateCb();
        }
      }
    }

    lastETAUpdate = new Date().getTime();

    var origin = new google.maps.LatLng(originLat, originLng), destination;

    destLat = parseFloat(destLat);
    destLng = parseFloat(destLng);

    if (destLat && destLat !== 0 && destLng !== 0) {
      destination = new google.maps.LatLng(destLat, destLng);
    } else {
      destination = destAddress;
      console.log('calculating ETA from address: (' + destAddress + ')');
    }

    if (etaFromServer) {
      lastEta = module.getLastKnownETA();
      if (lastEta <= 1) {
        console.log('calculating ETA less than a minute, recalculating');
        etaFromServer = false;
        return calculateETA(originLat, originLng, destLat, destLng, destAddress, onETACalculatedCallback);
      }
      if (lastEta <= 10) { // 10 minutes away can start getting updated ETA without traffic
        console.log('calculating ETA less than a 10 minutes, not taking from server anymore');
        etaFromServer = false;
      }
      etaMethod = null;
      initETAMethod();
      if (onETACalculatedCallback) {
        onETACalculatedCallback();
      }
      if (callbacks.etaUpdateCb) {
        callbacks.etaUpdateCb(lastEta);
      }
    } else if (destination && origin){
      var service = new google.maps.DistanceMatrixService();
      service.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: driverActivity,
          unitSystem: google.maps.UnitSystem.METRIC,
          durationInTraffic: true,
          avoidHighways: true,
          avoidTolls: true
        }, callback);
    } else {
      console.log('no destination or origin for eta');
    }
  }

  function onLocationUpdated(data) {
    console.log('Got location update: ' + JSON.stringify(data));
    if (data.lat && data.lng) {
      if (data.lat === 0 || data.lng === 0) {
        customerAlert({alert_type: 2});
      } else {
        configuration.current_lat = data.lat;
        configuration.current_lng = data.lng;

        lastEventTime = new Date().getTime();
        var animationCounter = 30, // should be (time since last update / animationInterval)
          fromLocation = locationFrames[locationFrames.length - 1];

        if (!fromLocation) {
          if (lastKnownLocation) {
            fromLocation = lastKnownLocation;
          } else {
            fromLocation = new google.maps.LatLng(configuration.current_lat, configuration.current_lng);
          }
        }

        var fromLat = fromLocation.lat(),
          fromLng = fromLocation.lng(),
          previousCurrLng = fromLng,
          previousCurrLat = fromLat;

        if (!fromLat || !fromLng){
          console.log('no from coordinates');

          if (callbacks.locationUpdateCb) {
            lastKnownLocation = new google.maps.LatLng(data.lat, data.lng);
            callbacks.locationUpdateCb(lastKnownLocation);
          }

          return;
        }

        console.log('Going from ' + fromLat + ',' + fromLng + ' to ' + data.lat + ',' + data.lng);

        for (var percent = 0; percent < 1; percent += 0.01) {
          var curLat = fromLat + percent * (data.lat - fromLat),
            curLng = fromLng + percent * (data.lng - fromLng);
          if (curLng !== previousCurrLng || curLat !== previousCurrLat) {
            locationFrames.push(new google.maps.LatLng(curLat, curLng));
            previousCurrLng = curLng;
            previousCurrLat = curLat;
          }
        }

        locationFrames.push(new google.maps.LatLng(data.lat, data.lng));

        if (lastETAUpdate === null) {
          console.log('no lastETAUpdate, updating now..');
          calculateETA(data.lat, data.lng, destination_lat, destination_lng, destination, function () {
            customerAlert({alert_type: 1, updated_eta: lastEta, driverActivity: driverActivity});
          });
        }
      }
    } else {
      console.log('Empty location received');
    }
  }

  module._onOrderUpdate = function(order){
    fillConfig(order);
    if (!configuration.order_uuid && order.uuid){
      configuration.order_uuid = order.uuid;
    }

    lastEventTime = new Date().getTime();

    if (!watchingDriver && shouldAutoWatchDriver && order.status === 2 && configuration.share_uuid && configuration.driver_uuid){
      module.watchDriver({share_uuid: configuration.share_uuid, driver_uuid : configuration.driver_uuid});
    }

    if(callbacks.orderUpdateCb){
      callbacks.orderUpdateCb(order);
    }
  };

  function fillConfig(params){
    if (!configuration){
      configuration = {};
    }
    if (!configuration.order_uuid && params.order_uuid){
      configuration.order_uuid = params.order_uuid;
    }
    if (!configuration.share_uuid && params.share_uuid){
      configuration.share_uuid = params.share_uuid;
    }
    if (!configuration.driver_uuid && params.driver_uuid){
      configuration.driver_uuid = params.driver_uuid;
    }
    if (!configuration.way_point_id && params.active_way_point_id){
      configuration.way_point_id = params.active_way_point_id;
    }
  }

  // ===================================
  // Socket
  // ===================================

  function onLocationSocketUpdated(data) {
    if (timeoutForRestPoll < 30000) {
      customerAlert({alert_type: 5, timeoutForRestPoll: timeoutForRestPoll});
      timeoutForRestPoll = timeoutForRestPoll + 5000;
    }
    onLocationUpdated(data);
  }

  /**
   *
   * @private
   */
  module._addSocketEventListeners = function(){
    module._socket.on('activity change', function (data) {
      console.log('activity changed');
      lastEventTime = new Date().getTime();

      setDriverActivity(data.activity);
      updateNow = true;
    });

    module._socket.on('way point arrived', function () {
      console.log('way point arrived');
      lastEventTime = new Date().getTime();
      watchingDriver = false;
      if (callbacks.driverArrivedCb) {
        callbacks.driverArrivedCb();
      }
    });

    var onWayPointEtaUpdated = function (data) {
      console.log('way point eta updated');
      lastEventTime = new Date().getTime();

      configuration.eta = data.eta;
      lastEta = module.getLastKnownETA();
      if (callbacks.etaUpdateCb) {
        callbacks.etaUpdateCb(lastEta);
      }
    };

    var onWayPointDone = function (){
      console.log('way point done');

      module._closeSocketConnection();

      watchingDriver = false;

      if (configuration.allow_rating) {
        if (callbacks.driverLeftCb) {
          callbacks.driverLeftCb();
        }
      } else {
        if (callbacks.taskEndedCb) {
          callbacks.taskEndedCb();
        }
      }
    };

    var onWayPointLocationUpdated = function (data) {
      console.log('onWayPointLocationUpdated arrived with ', JSON.stringify(data));
      lastEventTime = new Date().getTime();

      configuration.destination_lat = parseFloat(data.lat);
      configuration.destination_lng = parseFloat(data.lng);

      window.destinationLocation = new google.maps.LatLng(configuration.destination_lat, configuration.destination_lng);
      window.destinationMarker.setPosition(window.destinationLocation);
      window.resizeMapByMarkers(window.gmap, window.markerLocation, window.destinationLocation);
    };

    module._socket.on(WAY_POINT_DONE_EVENT, onWayPointDone);
    module._socket.on(WAY_POINT_ETA_UPDATE_EVENT, onWayPointEtaUpdated);
    module._socket.on(WAY_POINT_LOCATION_UPDATE_EVENT, onWayPointLocationUpdated);
    module._socket.on(ORDER_DONE_EVENT, onWayPointDone);
    module._socket.on(ORDER_UPDATE_EVENT, module._onOrderUpdate);
    module._socket.on(LOCATION_UPDATE_EVENT, onLocationSocketUpdated);
  };

  module._onSocketConnected = function() {
    connected = true;

    // try to establish a credential based socket connection.
    module._connectCustomer();

    if (callbacks.onConnectCb){
      callbacks.onConnectCb();
    }

    console.log('Socket connected, adding listeners');
    module._addSocketEventListeners();

    if (configuration) {
      if (configuration.order_uuid && configuration.share_uuid && configuration.way_point_id) {
        if (!watchingOrder) {
          module.watchOrder({
            order_uuid: configuration.order_uuid,
            share_uuid: configuration.share_uuid,
            way_point_id: configuration.way_point_id
          });
        }
      } else {
        console.log('not enough data in config for watch order');
      }

      if (configuration.driver_uuid && configuration.share_uuid) {
        if (!watchingDriver) {
          module.watchDriver({
            share_uuid: configuration.share_uuid,
            driver_uuid: configuration.driver_uuid
          });
        }
      } else {
        console.log('not enough data in config for watch driver');
      }

      if (configuration.order_uuid && configuration.way_point_id) {
        if (!watchingWayPoint) {
          module.watchWayPoint({
            order_uuid: configuration.order_uuid,
            way_point_id: configuration.way_point_id
          });
        }
      } else {
        console.log('not enough data in config for watch waypoint');
      }
    } else {
      console.log('onSocketConnected - no configuration yet');
    }
  };

  function onSocketDisconnected() {
    connected = false;
    console.log('module._socket disconnected');

    watchingDriver = false;
    watchingOrder = false;
    watchingWayPoint = false;

    if (callbacks.onDisconnectCb){
      callbacks.onDisconnectCb();
    }
  }

  function onSocketError(data){
    console.log('module._socket error: ' + JSON.stringify(data));
  }

  function onSocketConnecting(transport){
    console.log('module._socket connecting with ' + transport);
  }


  // =======================================
  // UTILS
  // =======================================

  function guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
  }

  function _isSafari() {
    var ua = navigator.userAgent.toLowerCase();
    return (ua.indexOf('safari') !== -1 && !ua.indexOf('chrome') > -1);
  }

  function supportsStorage() {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return 'localStorage' in window && window.localStorage !== null;
    } catch (e) {
      return false;
    }
  }

  function dataURItoBlob(dataURI) {
    var binary = atob(dataURI.split(',')[1]);
    var array = [];
    for (var i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i));
    }
    return new Blob([new Uint8Array(array)], {type: 'image/jpeg'});
  }

  function _loadScript(url, callback) {
    var done = false;
    var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.src = url;
    script.crossorigin = 'anonymous';
    script.onload = script.onreadystatechange = function () {
      if (!done && ( !this.readyState ||
        this.readyState === 'loaded' ||
        this.readyState === 'complete')) {
        done = true;
        if (callback) {
          callback();
        }
        script.onload = script.onreadystatechange = null;
        head.removeChild(script);
      }
    };
    head.appendChild(script);
  }

  return module;
}());




