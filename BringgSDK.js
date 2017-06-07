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

  var REAL_TIME_PRODUCTION = 'https://realtime2-api.bringg.com/';
  var REAL_TIME_STAGING = 'https://staging-realtime.bringg.com/';

  var REAL_TIME_OPTIONS = {
    'END_POINT': REAL_TIME_PRODUCTION,
    'SECURED_SOCKETS': true,
    'SOCKET_WEBSOCKET_PORT': 443,
    'SOCKET_XHR_PORT': 8443
  };

  module.RETURN_CODES = {
    'success': 0,
    'expired': 1,
    'unknown_reason': 2,
    'no_response': 3,
    'missing_params': 4
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
    shouldAutoWatchWayPoint = false,
    debugEnabled = false;

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
   * @param initSuccessCb - [optional] a callback for initialization done.
   * @param initFailedCb - [optional] a callback for initialization failed.
   */
  module.initializeBringg = function (params, initSuccessCb, initFailedCb) {

    if (!params) {
      log('init failed : missing params');
      if (initFailedCb) {
        initFailedCb({success: false, rc: module.RETURN_CODES.missing_params, error: 'missing params'});
      }
      return;
    }

    module._setCredentials(params);

    if (initFailedCb) {
      callbacks.failedLoadingCb = initFailedCb;
    }

    // get config only if provided with share uuid
    var shareUuid = params.share_uuid;
    if (shareUuid) {
      var beforeCall = new Date();

      getShareConfig(shareUuid, function (updatedConfiguration) {
        log('new shared config ' + JSON.stringify(updatedConfiguration));

        var afterCall = new Date() - beforeCall;

        //update relative paths
        updatedConfiguration.employee_image = _updateAssetPath(updatedConfiguration.employee_image);
        updatedConfiguration.deliveryPin = _updateAssetPath(updatedConfiguration.deliveryPin);
        updatedConfiguration.destinationPin = _updateAssetPath(updatedConfiguration.destinationPin);
        updatedConfiguration.merchant_logo = _updateAssetPath(updatedConfiguration.merchant_logo);

        configuration = updatedConfiguration;
        configuration.share_uuid = shareUuid;

        module._onNewConfiguration(configuration);

        customerAlert({alert_type: 7, time: afterCall});

        if (initSuccessCb) {
          initSuccessCb(configuration);
        }

      }, function (jqXHR, textStatus, errorThrown) {
        log('new shared config failed: ' + (jqXHR.status || 503) + ', ' + errorThrown);
        if (callbacks.failedLoadingCb) {
          callbacks.failedLoadingCb({success: false, rc: module.RETURN_CODES.unknown_reason, status: (jqXHR.status || 503)  , error: errorThrown});
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
  module.connect = function (customerAccessToken, onConnectCb, onDisconnectCb) {
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

  module.isConnected = function () {
    return connected;
  };

  module.setConfiguration = function (value) {
    configuration = value;
  };

  module.setDebug = function (value) {
    debugEnabled = value;
  };


  // ================================================
  // watch apis
  // ================================================

  /**
   *
   * @param params
   * @param callback
   */
  module.watchOrder = function (params, callback) {

    if (!isValidWatchOrderParams(params)){
       log('watchOrder: invalid params' + JSON.stringify(params));
      if (callback){
          callback({
            success: false,
            rc: module.RETURN_CODES.missing_params,
            error: 'watch order failed - params must contain at least two of the following params order_uuid, share_uuid, access_token'
          });
      }
      return;
    }

    log('watching order :' + JSON.stringify(params));
    module._socket.emit('watch order', params, function (result) {
      module._watchOrderCb(result, callback);

      // if we succeeded then use the watch params to fill missing config params and credentials
      fillConfig(params);
      module._setCredentials(params);

      if (!configuration.expired || configuration.expired === false || configuration.expired === 'false') {
        if (!watchingWayPoint && shouldAutoWatchWayPoint && configuration.way_point_id && configuration.order_uuid) {
          module.watchWayPoint({order_uuid: configuration.order_uuid, way_point_id: configuration.way_point_id});
        }
      }
    });
  };

  module._watchOrderCb = function (result, callback) {
    if (result) {

      // cache the params returned from the watch in any case if we received data (even if expired)
      if (result.shared_location) {
        module.setConfiguration(result.shared_location);
        configuration.share_uuid = result.shared_location.uuid;
        module._onNewConfiguration(result.shared_location);
      }

      if (result.success) {
        watchingOrder = true;
        if (result.order_uuid){
          configuration.order_uuid = result.order_uuid;
        }
        if (callback) {
          callback(result);
        }
      } else if (callback) {
        callback({success: false, rc: module.RETURN_CODES.unknown_reason, error: 'watch order failed - unknown reason'})
      }

    } else {
      log('watch order: no result');
      if (callback) {
        callback({success: false, rc: module.RETURN_CODES.no_response, error: 'watch order failed - no response'})
      }
    }
  };

  /**
   *
   * @param params
   * @param callback
   */
  module.watchDriver = function (params, callback) {
    if (!params || !params.driver_uuid || !params.share_uuid){
        log('watchDriver: invalid params' + JSON.stringify(params));
        if (callback){
            callback({
                success: false,
                rc: module.RETURN_CODES.missing_params,
                error: 'watch driver failed - params must contain driver_uuid and share_uuid'
            });
        }
        return;
    }

    log('watching driver :' + JSON.stringify(params));
    module._socket.emit('watch driver', params, function (result) {
      module._watchDriverCb(result, callback);
    });

    fillConfig(params);
    module._setCredentials(params);
  };

  module._watchDriverCb = function (result, callback) {
    if (result && result.success) {
      watchingDriver = true;

      // start calculating eta once we successfully watch a driver
      module._setETACalcInterval(timeoutForETACalculation);

      if (callback) {
        callback(result)
      }
    } else if (callback) {
      callback({
        success: false,
        rc: result ? module.RETURN_CODES.unknown_reason : module.RETURN_CODES.no_response,
        error: 'failed watching driver'
      })
    }
  };

  /**
   *
   * @param params
   * @param callback
   */
  module.watchWayPoint = function (params, callback) {
    log('watching waypoint :' + JSON.stringify(params));
    module._socket.emit('watch way point', params, function (result) {
      module._watchWayPointCb(result, callback);
    });
  };

  module._watchWayPointCb = function (result, callback) {
    if (result && result.success) {
      watchingWayPoint = true;

      if (callback) {
        callback(result);
      }
    } else if (callback) {
      callback({
        success: false,
        rc: result ? module.RETURN_CODES.unknown_reason : module.RETURN_CODES.no_response,
        error: 'failed watching waypoint'
      })
    }
  };

  module._connectCustomer = function () {
    if (module._credentials !== {}) {
      log('calling connect customer with ' + JSON.stringify(module._credentials));
      module._socket.emit('customer connect', module._credentials, function (result) {
        log(JSON.stringify(result));
      });
    } else {
      log('no credentials to connect customer');
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
      if (configuration.rating_url && configuration.rating_token) {
        $.post(configuration.rating_url, {
          rating: rating,
          token: configuration.rating_token
        }, function (response) {
          if (callbacks.taskRatedCb) {
            callbacks.taskRatedCb(response);
          }
        }).fail(function () {
          log('unknown error while rating');
          if (callbacks.taskRatedCb) {
            callbacks.taskRatedCb({success: false, message: 'Unknown error while rating'});
          }
        });
      } else {
        log('submit rating - no url or token provided for rating');
        if (callbacks.taskRatedCb) {
          callbacks.taskRatedCb({success: false, message: 'no url or token provided for rating'});
        }
      }
    } else {
      log('submit rating - no configuration');
      if (callbacks.taskRatedCb) {
        callbacks.taskRatedCb({success: false, message: 'invalid configuration'});
      }
    }
  };

  module.submitRatingReason = function (ratingReasonId) {
    if (configuration && configuration.rating_reason) {
      if (configuration.rating_reason.rating_reason_url) {
        $.post(configuration.rating_reason.rating_reason_url, {
          rating_reason_id: ratingReasonId,
          token: configuration.rating_token
        }, function (response) {
          if (callbacks.taskPostRatedCb) {
            callbacks.taskPostRatedCb(response);
          }
        }).fail(function () {
          log('submit rating reason - unknown error');
          if (callbacks.taskPostRatedCb) {
            callbacks.taskPostRatedCb({success: false, message: 'Unknown error while submitting rating reason.'});
          }
        });
      } else {
        log('submit rating reason - no url provided for rating');
        if (callbacks.taskPostRatedCb) {
          callbacks.taskPostRatedCb({success: false, message: 'no url provided for rating reason'});
        }
      }
    } else {
      log('submit rating reason - invalid configuration');
      if (callbacks.taskPostRatedCb) {
        callbacks.taskPostRatedCb({success: false, message: 'invalid configuration'});
      }
    }
  };

  module.submitNote = function (note) {
    if (!note) {
      return;
    }
    if (configuration && configuration.note_url && configuration.note_token) {
      $.post(configuration.note_url, {
        note: note,
        token: configuration.note_token
      }, function (response) {
        if (callbacks.noteAddedCb) {
          callbacks.noteAddedCb(response);
        }
      }).fail(function () {
        log('submit note - error while submitting note');
        if (callbacks.noteAddedCb) {
          callbacks.noteAddedCb({success: false, message: 'Unknown error while sending note'});
        }
      });
    } else {
      log('submit note - invalid configuration');
      if (callbacks.noteAddedCb) {
        callbacks.noteAddedCb({success: false, message: 'invalid configuration'});
      }
    }
  };

  /**
   *
   * @param position
   * @param successCb
   * @param failureCb
   */
  module.submitLocation = function (position, successCb, failureCb) {
    if (configuration && configuration.find_me_url && configuration.find_me_token) {
      $.post(configuration.find_me_url, {
        position: position,
        find_me_token: configuration.find_me_token
      }).success(function (response) {
        if (successCb) {
          successCb(response);
        }
      }).fail(function () {
        log('submit location - unknown error');
        if (failureCb) {
          failureCb();
        }
      });
    } else {
      log('submit location - invalid configuration');
      if (failureCb) {
        failureCb();
      }
    }
  };

  /**
   *
   */
  module.submitTip = function (tip) {
    var canvas = document.getElementById('newSignature');// save canvas image as data url (png format by default)
    var blob = dataURItoBlob(canvas.toDataURL('image/jpg'));
    var fileName = guid() + '.jpg';

    if (configuration && configuration.tipConfiguration && configuration.tipConfiguration.tipSignatureUploadPath
      && configuration.tipConfiguration.tipCurrency && configuration.tip_token && tipConfiguration.tipUrl)
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

  module.getLastETAUpdateTime = function () {
    return lastETAUpdate;
  };

  module.getETAOrigin = function () {
    return etaFromServer ? 'server' : 'client';
  };

  module.getDriverActivity = function () {
    return driverActivity;
  };

  module.setOrderUpdateCb = function (cb) {
    callbacks.orderUpdateCb = cb;
  };

  module.setLocationUpdateCb = function (cb) {
    callbacks.locationUpdateCb = cb;
  };

  module.setETAUpdateCb = function (cb) {
    callbacks.etaUpdateCb = cb;
  };

  module.setETAMethodChangedCb = function (cb) {
    callbacks.etaMethodChangedCb = cb;
  };

  module.getETAMethod = function () {
    return etaMethod;
  };

  module.setETAMethod = function (newETAMethod) {
    etaMethod = newETAMethod;
  };

  module.setDestination = function (lat, lng) {
    destination_lat = lat;
    destination_lng = lng;
    destination = new google.maps.LatLng(lat, lng);
  };

  module.setConnectionCallbacks = function (onConnectCb, onDisconnectCb) {
    if (onConnectCb) {
      callbacks.onConnectCb = onConnectCb;
    }
    if (onDisconnectCb) {
      callbacks.onDisconnectCb = onDisconnectCb;
    }
  };

  module.setAutoWatchDriver = function (enable) {
    shouldAutoWatchDriver = enable
  };

  module.setAutoWatchWayPoint = function (enable) {
    shouldAutoWatchWayPoint = enable
  };

  module.isWatchingDriver = function () {
    return watchingDriver;
  };

  module.isWatchingOrder = function () {
    return watchingOrder;
  };

  //========================================================================
  //
  // PRIVATE
  //
  //========================================================================

  function isValidWatchOrderParams(params) {
    // watch order must have at least 2 params
    if (!params || params.length < 2) {
       return false;
    }
    
    if (!params.order_uuid && (!params.share_uuid || !params.access_token)){
        return false;
    }

    if (!params.access_token && (!params.share_uuid || !params.order_uuid)){
        return false;
    }

    return true;
  }

  function getRealTimeEndPoint() {
    return window.MONITOR_END_POINT ?
      window.MONITOR_END_POINT.indexOf('/', window.MONITOR_END_POINT.length - 1) !== -1 ? window.MONITOR_END_POINT : window.MONITOR_END_POINT + '/'
      : REAL_TIME_OPTIONS.END_POINT;
  }

  function getWebSocketPort() {
    return window.SOCKET_WEBSOCKET_PORT ? window.SOCKET_WEBSOCKET_PORT
      : isLocal() ? '3030'
        : REAL_TIME_OPTIONS.SOCKET_WEBSOCKET_PORT;
  }

  function getXHRPort() {
    return window.SOCKET_XHR_PORT ? window.SOCKET_XHR_PORT
      : isLocal() ? '3030'
        : REAL_TIME_OPTIONS.SOCKET_XHR_PORT;
  }

  function getSecuredSocketSetup() {
    return window.SECURED_SOCKETS ? window.SECURED_SOCKETS
      : isLocal() ? false
        : REAL_TIME_OPTIONS.SECURED_SOCKETS;
  }

  // ========================================================================

  module._setWatchingDriver = function (isWatching) {
    watchingDriver = isWatching;
  };

  module._setWatchingOrder = function (isWatching) {
    watchingOrder = isWatching;
  };

  /**
   * connect the socket and registers all connection listeners.
   * if a previous connection exists it closes it first.
   */
  module._connectSocket = function () {
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
   */
  module._closeSocketConnection = function () {
    if (module._socket) {
      module._socket.disconnect();
      module._socket.removeAllListeners();
      module._socket = null;
    }
    watchingDriver = false;
    watchingOrder = false;
    watchingWayPoint = false;
  };

  /**
   *
   */
  module._onETAIntervalSet = function () {
    if (!watchingDriver) {
      log('eta - no current tracking, stopping.');
      clearInterval(etaInterval);
      return;
    }

    var eta = 0;
    if (lastEta && lastETAUpdate) {
      if (new Date().getTime() - lastETAUpdate > 1000 * 60) {
        log('Over a minute since eta update, recalculating ETA');
        if (etaFromServer) {
          eta = module.getLastKnownETA();
          if (eta <= 5) {
            log('(eta ' + eta + ') -> Not taking from server anymore');
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
  };

  module._onETATimeoutSet = function () {
    if (lastETAUpdate === null && watchingDriver) {
      log('no lastETAUpdate after timeout, calculating');
      calculateETA(configuration.current_lat, configuration.current_lng, destination_lat, destination_lng, destination, function () {
        customerAlert({alert_type: 1, updated_eta: lastEta, driverActivity: driverActivity});
      });
    }
  };

  /**
   * set timer interval for calculating eta.
   * will only calculate if in the state of watching driver's progress.
   */
  module._setETACalcInterval = function (timeoutForETACalculation) {
    etaInterval = setInterval(module._onETAIntervalSet, timeoutForETACalculation);
    setTimeout(module._onETATimeoutSet, 3000);
  };

  /**
   * validates configuration and
   * @param configuration
   */
  module._onNewConfiguration = function (configuration) {

    if (configuration.expired === undefined || !configuration.expired || configuration.expired === 'false') {

      if (configuration.done === undefined || !configuration.done || configuration.done === 'false') {
        etaFromServer = configuration.eta ? true : false;

        if (configuration.destination_lat && configuration.destination_lng) {
          destination_lat = configuration.destination_lat;
          destination_lng = configuration.destination_lng;
        }
        if (configuration.destination) {
          destination = configuration.destination;
        }

        module._setDriverActivity(configuration.driverActivity);

        module._setPollingInterval();

        initETAMethod();
        if (watchingDriver) {
          module._setETACalcInterval(timeoutForETACalculation);
        }

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
   */
  module._setCredentials = function (params) {
    if (params.token) {
      module._credentials.token = params.token;
    }
    if (params.access_token) {
      module._credentials.customer_access_token = params.access_token;
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

  module._setDriverActivity = function (newActivity) {
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
  };

  function customerAlert(options) {
    if (!configuration.alerting_token) {
      return;
    }

    var data = $.extend({}, {alert_type: 0, token: configuration.alerting_token}, options);

    $.post(configuration.alerting_url, data, function (response) {
      log(response.success);
    }).fail(function () {
      log('Failed alerting');
    });
  }

  module._setPollingInterval = function () {

    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(function () {

      if (lastEventTime) {
        var timeSinceUpdate = new Date().getTime() - lastEventTime;
        var minTimeToWait = connected ? timeoutForRestIfSocketConnected : timeoutForRestPoll;
        if (timeSinceUpdate > minTimeToWait) {
          // poll order anyway
          getSharedOrder({
              order_uuid: configuration.order_uuid,
              share_uuid: configuration.share_uuid,
              access_token: module._credentials.customer_access_token
          });

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
  };

  function getShareConfig(uuid, callback, errorCallback) {
    log('Getting shared config for uuid: ' + uuid);
    $.getJSON(getRealTimeEndPoint() + 'shared/' + uuid + '?full=true', callback).error(errorCallback);
  }

  function getSharedLocation(uuid) {
    log('Getting location via REST for uuid: ' + uuid);

    $.getJSON(getRealTimeEndPoint() + 'shared/' + uuid + '/location/', function (result) {
      log('Rest location update: ' + JSON.stringify(result));
      if ((result.success || result.status === 'ok') && result.current_lat && result.current_lng) {
        var locationData = {
          lat: result.current_lat,
          lng: result.current_lng
        };
        onLocationUpdated(locationData);
      }
    }).error(function (jqXHR, textStatus, errorThrown) {
      log('Rest localtion update failed: ' + (jqXHR.status || 503) + ', ' + errorThrown);
      if (callbacks.locationUpdateCb) {
        callbacks.locationUpdateCb({success: false, status: (jqXHR.status || 503) , error: errorThrown});
      }
    });
  }

  function getOrderViaRestByOrderUuid(shareUuid, orderUuid) {
    log('Getting order via REST with share uuid: ' + shareUuid);
    $.getJSON(getRealTimeEndPoint() + 'watch/shared/' + shareUuid + '?order_uuid=' + orderUuid, function (result) {
      log('Rest order update: ' + JSON.stringify(result));
      if (result.success && result.order_update) {
        module._onOrderUpdate(result.order_update);
      }
    }).error(function (jqXHR, textStatus, errorThrown) {
      log('Rest order update failed: ' + (jqXHR.status || 503) + ', ' + errorThrown);
      if (callbacks.orderUpdateCb) {
        callbacks.orderUpdateCb({success: false, status: (jqXHR.status || 503) , error: errorThrown});
      }
    });
  }

   function getOrderViaRestByAccessToken(shareUuid, accessToken) {
    log('Getting order via REST with share uuid: ' + shareUuid);
    $.getJSON(getRealTimeEndPoint() + 'watch/shared/' + shareUuid + '?access_token=' + accessToken, function (result) {
      log('Rest order update: ' + JSON.stringify(result));
      if (result.success && result.order_update) {
        module._onOrderUpdate(result.order_update);
      }
    }).error(function (jqXHR, textStatus, errorThrown) {
      log('Rest order update failed: ' + (jqXHR.status || 503) + ', ' + errorThrown);
      if (callbacks.orderUpdateCb) {
        callbacks.orderUpdateCb({success: false, status: (jqXHR.status || 503) , error: errorThrown});
      }
    });
  }

  function createShareForOrderViaRestByAccessToken(orderUuid, customerAccessToken) {
    log('creating share via REST for order_uuid: ' + orderUuid);
    $.getJSON(getRealTimeEndPoint() + 'shared/orders?order_uuid=' + orderUuid + '&access_token=' + customerAccessToken, function (result) {
      log('Rest order update: ' + JSON.stringify(result));
      if (result.success && result.order_update) {
        module._onOrderUpdate(result.order_update);
      }
    }).error(function (jqXHR, textStatus, errorThrown) {
      log('Rest order update failed: ' + (jqXHR.status || 503) + ', ' + errorThrown);
      if (callbacks.orderUpdateCb) {
        callbacks.orderUpdateCb({success: false, status: (jqXHR.status || 503) , error: errorThrown});
      }
    });
  }

  function getSharedOrder(params) {
    if (!isValidWatchOrderParams(params)){
      log('params must contain at least two of the following params order_uuid, share_uuid, access_token');
      return;
    }
    
    // the rest method we call depends on the param combination we have
    if (params.share_uuid && params.order_uuid) {
      getOrderViaRestByOrderUuid(params.share_uuid, params.order_uuid);

    } else if (params.share_uuid && params.access_token) {
      getOrderViaRestByAccessToken(params.share_uuid, params.access_token);

    } else if (params.access_token) {
      createShareForOrderViaRestByAccessToken(params.order_uuid, params.access_token);
    } 
    
  }

  // =========================================

  function setLocationAnimationInterval() {
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
        log('Updating ETA after timeout of (' + (now - lastETAUpdate) + ') with (' + counterSinceMapResize + ') and (' + updateNow + ')');
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

  function onETACalculated(response, status) {

  }

  function calculateETA(originLat, originLng, destLat, destLng, destAddress, onETACalculatedCallback) {
    if (!watchingDriver) {
      return;
    }
    log('calculating ETA.. (' + originLat + ',' + originLng + ') to (' + destLat + ',' + destLng + ')');

    if (!originLat || !originLng || !destLat || !destLng) {
      return;
    }

    function callback(response, status) {
      if (response) {
        log('calculating ETA received (' + status + '): ', response.rows);
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
              log('calculating ETA - new ETA: ' + element.duration.value + ' seconds');

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
              log('calculating ETA received (' + element.status + ') no results');
              if (callbacks.etaUpdateCb) {
                callbacks.etaUpdateCb();
              }
            }
          }
        }
      } else {
        log('calculating ETA received error: ' + status);
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
      log('calculating ETA from address: (' + destAddress + ')');
    }

    if (etaFromServer) {
      lastEta = module.getLastKnownETA();
      if (lastEta <= 1) {
        log('calculating ETA less than a minute, recalculating');
        etaFromServer = false;
        return calculateETA(originLat, originLng, destLat, destLng, destAddress, onETACalculatedCallback);
      }
      if (lastEta <= 10) { // 10 minutes away can start getting updated ETA without traffic
        log('calculating ETA less than a 10 minutes, not taking from server anymore');
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
    } else if (destination && origin) {
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
      log('no destination or origin for eta');
    }
  }

  function onLocationUpdated(data) {
    log('Got location update: ' + JSON.stringify(data));
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

        if (!fromLat || !fromLng) {
          log('no from coordinates');

          if (callbacks.locationUpdateCb) {
            lastKnownLocation = new google.maps.LatLng(data.lat, data.lng);
            callbacks.locationUpdateCb(lastKnownLocation);
          }

          return;
        }

        log('Going from ' + fromLat + ',' + fromLng + ' to ' + data.lat + ',' + data.lng);

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
          log('no lastETAUpdate, updating now..');
          calculateETA(data.lat, data.lng, destination_lat, destination_lng, destination, function () {
            customerAlert({alert_type: 1, updated_eta: lastEta, driverActivity: driverActivity});
          });
        }
      }
    } else {
      log('Empty location received');
    }
  }

  module._onOrderUpdate = function (order) {
    fillConfig(order);

    //update relative paths
    if (order.customer) {
      order.customer.image = _updateAssetPath(order.customer.image);
    }

    if (order.driver) {
      order.driver.profile_image = _updateAssetPath(order.driver.profile_image);
    }

    if (!configuration.order_uuid && order.uuid) {
      configuration.order_uuid = order.uuid;
    }

    lastEventTime = new Date().getTime();

    if (!watchingDriver && shouldAutoWatchDriver && order.status === 2 && configuration.share_uuid && configuration.driver_uuid) {
      module.watchDriver({share_uuid: configuration.share_uuid, driver_uuid: configuration.driver_uuid});
    }

    if (callbacks.orderUpdateCb) {
      callbacks.orderUpdateCb(order);
    }
  };

  function fillConfig(params) {
    if (!configuration) {
      configuration = {};
    }
    if (!configuration.order_uuid && params.order_uuid) {
      configuration.order_uuid = params.order_uuid;
    }
    if (!configuration.share_uuid && params.share_uuid) {
      configuration.share_uuid = params.share_uuid;
    }
    if (!configuration.driver_uuid && params.driver_uuid) {
      configuration.driver_uuid = params.driver_uuid;
    }
    if (!configuration.way_point_id && params.active_way_point_id) {
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

  /*
   * Safe subscribe - first remove all subscription to this
   * event and then subscribe.
   *
   * This useful for events with subscribiption that dosen't
   * have repeating event names.
   *
   * @private
   */
  module._safeSubscribe = function (event, callback) {
    module._socket.off(event);
    module._socket.on(event, callback);
  };

  /**
   *
   * @private
   */
  module._addSocketEventListeners = function () {
    module._safeSubscribe('activity change', function (data) {
      log('activity changed');
      lastEventTime = new Date().getTime();

      module._setDriverActivity(data.activity);
      updateNow = true;
    });

    module._safeSubscribe('way point arrived', function () {
      log('way point arrived');
      lastEventTime = new Date().getTime();
      watchingDriver = false;
      if (callbacks.driverArrivedCb) {
        callbacks.driverArrivedCb();
      }
    });

    var onWayPointEtaUpdated = function (data) {
      log('way point eta updated');
      lastEventTime = new Date().getTime();

      configuration.eta = data.eta;
      lastEta = module.getLastKnownETA();
      if (callbacks.etaUpdateCb) {
        callbacks.etaUpdateCb(lastEta);
      }
    };

    var onWayPointDone = function () {
      log('way point done');

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
      log('onWayPointLocationUpdated arrived with ', JSON.stringify(data));
      lastEventTime = new Date().getTime();

      configuration.destination_lat = parseFloat(data.lat);
      configuration.destination_lng = parseFloat(data.lng);

      window.destinationLocation = new google.maps.LatLng(configuration.destination_lat, configuration.destination_lng);
      window.destinationMarker.setPosition(window.destinationLocation);
      window.resizeMapByMarkers(window.gmap, window.markerLocation, window.destinationLocation);
    };

    module._safeSubscribe(WAY_POINT_DONE_EVENT, onWayPointDone);
    module._safeSubscribe(WAY_POINT_ETA_UPDATE_EVENT, onWayPointEtaUpdated);
    module._safeSubscribe(WAY_POINT_LOCATION_UPDATE_EVENT, onWayPointLocationUpdated);
    module._safeSubscribe(ORDER_DONE_EVENT, onWayPointDone);
    module._safeSubscribe(ORDER_UPDATE_EVENT, module._onOrderUpdate);
    module._safeSubscribe(LOCATION_UPDATE_EVENT, onLocationSocketUpdated);
  };

  module._onSocketConnected = function () {
    connected = true;

    // try to establish a credential based socket connection.
    module._connectCustomer();

    if (callbacks.onConnectCb) {
      callbacks.onConnectCb();
    }

    log('Socket connected, adding listeners');
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
        log('not enough data in config for watch order');
      }

      if (configuration.driver_uuid && configuration.share_uuid) {
        if (!watchingDriver) {
          module.watchDriver({
            share_uuid: configuration.share_uuid,
            driver_uuid: configuration.driver_uuid
          });
        }
      } else {
        log('not enough data in config for watch driver');
      }

      if (configuration.order_uuid && configuration.way_point_id) {
        if (!watchingWayPoint) {
          module.watchWayPoint({
            order_uuid: configuration.order_uuid,
            way_point_id: configuration.way_point_id
          });
        }
      } else {
        log('not enough data in config for watch waypoint');
      }
    } else {
      log('onSocketConnected - no configuration yet');
    }
  };

  function onSocketDisconnected() {
    connected = false;
    log('module._socket disconnected');

    watchingDriver = false;
    watchingOrder = false;
    watchingWayPoint = false;

    if (callbacks.onDisconnectCb) {
      callbacks.onDisconnectCb();
    }
  }

  function onSocketError(data) {
    log('module._socket error: ' + JSON.stringify(data));
  }

  function onSocketConnecting(transport) {
    log('module._socket connecting with ' + transport);
  }


  // =======================================
  // UTILS
  // =======================================

  function isLocal() {
    return getRealTimeEndPoint().indexOf('localhost') != -1;
  }

  function isDebug() {
    return debugEnabled;
  }

  function log(text) {
    if (isLocal() || isDebug()) {
      console.log(text);
    }
  }

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

  function _updateAssetPath(path) {
    if (!path) {
      return path;
    }

    if (path.indexOf('http') === -1) {
      return 'https://app.bringg.com' + path;
    }

    return path;
  }

  return module;
}());
