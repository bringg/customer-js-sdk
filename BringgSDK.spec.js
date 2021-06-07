"use strict";

beforeEach(function () {
  BringgSDK._socket = null;
  window.$ = {
    get: function () {},
    getJSON: function () {},
  };
});

describe("BringgSDK", function () {
  it("check the API of the service", function () {
    expect(BringgSDK._socket).toBeNull();
    expect(BringgSDK.initializeBringg).toBeDefined();
    expect(BringgSDK.terminateBringg).toBeDefined();

    expect(BringgSDK.connect).toBeDefined();
    expect(BringgSDK.isConnected).toBeDefined();
    expect(BringgSDK.watchOrder).toBeDefined();

    expect(BringgSDK.setConfiguration).toBeDefined();
    expect(BringgSDK.setDriverActivity).toBeDefined();
    expect(BringgSDK.setEventCallback).toBeDefined();
    expect(BringgSDK.submitRating).toBeDefined();
    expect(BringgSDK.submitRatingReason).toBeDefined();
    expect(BringgSDK.submitNote).toBeDefined();
    expect(BringgSDK.submitLocation).toBeDefined();
    expect(BringgSDK.submitTip).toBeDefined();

    expect(BringgSDK.getLastKnownETA).toBeDefined();
    expect(BringgSDK.getETAMethod).toBeDefined();
    expect(BringgSDK.setOrderUpdateCb).toBeDefined();
    expect(BringgSDK.setLocationUpdateCb).toBeDefined();
    expect(BringgSDK.setETAUpdateCb).toBeDefined();
    expect(BringgSDK.setETAMethodChangedCb).toBeDefined();
    expect(BringgSDK.setETAMethod).toBeDefined();
    expect(BringgSDK.setConnectionCallbacks).toBeDefined();

    expect(BringgSDK.getDriverPhone).toBeDefined();
  });

  it("check internal methods", function () {
    expect(BringgSDK._setETACalcInterval).toBeDefined();
    expect(BringgSDK._onETAIntervalSet).toBeDefined();
    expect(BringgSDK._setPollingInterval).toBeDefined();
    expect(BringgSDK._setCredentials).toBeDefined();
  });

  describe("initializeBringg", function () {
    beforeEach(function () {
      // Don't call to google on tests
      spyOn(BringgSDK, "_setDriverActivity").and.stub();

      // Don't connect to realtime
      spyOn(window, "io").and.returnValue({ on: function () {} });

      // Mock getJSON for getSharedConfig
      spyOn(window.$, "getJSON").and.callFake(function (url, callback) {
        callback({});
        return { error: function () {} };
      });
    });

    it("connects to the right url by developer token", function (done) {
      var config = {
        token: "ew1_MySecretToken",
        share_uuid: "shared",
      };

      function onInit() {
        expect(window.io).toHaveBeenCalled();

        // make sure we are connected to europe since
        // token starts with "ew1_"
        var socketUrl = window.io.calls.first().args[0];
        expect(socketUrl).toEqual("https://eu1-realtime.bringg.com");

        done();
      }

      BringgSDK.initializeBringg(config, onInit, function onFailure() {
        done(new Error("Failed!"));
      });
    });
  });

  describe("_setCredentials", function () {
    it("persists customer access token if passed", function () {
      spyOn(BringgSDK, "_setUpConfigByToken").and.stub();

      var token = "token231";
      BringgSDK._setCredentials({ access_token: token });

      expect(BringgSDK._credentials.customer_access_token).toEqual(token);
    });

    describe("developer access token", function () {
      it("calls _setUpConfigByToken if developer token is passed", function () {
        spyOn(BringgSDK, "_setUpConfigByToken").and.stub();

        var token = "token231";
        BringgSDK._setCredentials({ token: token });

        expect(BringgSDK._setUpConfigByToken).toHaveBeenCalledWith(token);
      });

      it("it warns of deprecation if no developer token is passed", function () {
        spyOn(BringgSDK, "_setUpConfigByToken").and.stub();
        spyOn(console, "warn").and.stub();

        BringgSDK._setCredentials({});

        expect(BringgSDK._setUpConfigByToken).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(
          "Connecting to Bringg Customer JS SDK without Developer Access Token will be deprecated"
        );
      });
    });
  });

  describe("_setUpConfigByToken", function () {
    it("backward compatabillity: uses default region if region specificied", function () {
      var defaultConfig = BringgSDK._getRealtimeOptions();

      BringgSDK._setUpConfigByToken("no3prefix");
      expect(BringgSDK._getRealtimeOptions()).toEqual(defaultConfig);
      expect(BringgSDK._credentials.token).toEqual("no3prefix");

      BringgSDK._setUpConfigByToken("troll_no3prefix");
      expect(BringgSDK._getRealtimeOptions()).toEqual(defaultConfig);
      expect(BringgSDK._credentials.token).toEqual("troll_no3prefix");

      BringgSDK._setUpConfigByToken("_justunderscore");
      expect(BringgSDK._getRealtimeOptions()).toEqual(defaultConfig);
      expect(BringgSDK._credentials.token).toEqual("_justunderscore");

      BringgSDK._setUpConfigByToken("ew1_");
      expect(BringgSDK._getRealtimeOptions()).toEqual(defaultConfig);
      expect(BringgSDK._credentials.token).toEqual("ew1_");

      BringgSDK._setUpConfigByToken("_");
      expect(BringgSDK._getRealtimeOptions()).toEqual(defaultConfig);
      expect(BringgSDK._credentials.token).toEqual("_");

      BringgSDK._setUpConfigByToken("it1_invalidregion");
      expect(BringgSDK._getRealtimeOptions()).toEqual(defaultConfig);
      expect(BringgSDK._credentials.token).toEqual("it1_invalidregion");
    });

    it("takes region from prefix", function () {
      var ue1Endpoint = "https://realtime2-api.bringg.com/";
      var ew1Endpoint = "https://eu1-realtime.bringg.com";
      var ew1gEndpoint = "https://eu2-realtime.bringg.com";
      var ue4gEndpoint = "https://us2-realtime.bringg.com";

      BringgSDK._setUpConfigByToken("ue1_cooltoken");
      expect(BringgSDK._getRealtimeOptions().END_POINT).toEqual(ue1Endpoint);
      expect(BringgSDK._credentials.token).toEqual("cooltoken");

      BringgSDK._setUpConfigByToken("ew1_cooltoken");
      expect(BringgSDK._getRealtimeOptions().END_POINT).toEqual(ew1Endpoint);
      expect(BringgSDK._credentials.token).toEqual("cooltoken");

      BringgSDK._setUpConfigByToken("ew1g_besttoken");
      expect(BringgSDK._getRealtimeOptions().END_POINT).toEqual(ew1gEndpoint);
      expect(BringgSDK._credentials.token).toEqual("besttoken");

      BringgSDK._setUpConfigByToken("ue4g_besttoken");
      expect(BringgSDK._getRealtimeOptions().END_POINT).toEqual(ue4gEndpoint);
      expect(BringgSDK._credentials.token).toEqual("besttoken");
    });
  });

  describe("getRegionByCodeNumber", function () {
    var REGIONS_ENUM = {
      ew1: 1,
      ue1: 2,
      ew1g: 5,
      ue4g: 6,
    };

    it("should return undefined when no code provided", function () {
      expect(BringgSDK.getRegionByCodeNumber()).toEqual(undefined);
    });

    it("should return undefined when region is not a number", function () {
      expect(BringgSDK.getRegionByCodeNumber(faker.name.firstName())).toEqual(
        undefined
      );
    });

    it("should return region name if code is valid", function () {
      expect(BringgSDK.getRegionByCodeNumber(REGIONS_ENUM["ew1"])).toEqual(
        "ew1"
      );
      expect(BringgSDK.getRegionByCodeNumber(REGIONS_ENUM["ue1"])).toEqual(
        "ue1"
      );
      expect(BringgSDK.getRegionByCodeNumber(REGIONS_ENUM["ew1g"])).toEqual(
        "ew1g"
      );
      expect(BringgSDK.getRegionByCodeNumber(REGIONS_ENUM["ue4g"])).toEqual(
        "ue4g"
      );
    });

    it("should not return region if code not found", function () {
      expect(
        BringgSDK.getRegionByCodeNumber(
          faker.random.number({ min: 10, max: 100 })
        )
      ).toEqual(undefined);
    });
  });

  describe("getRegionCodeFromUrl", function () {
    it("should return code from valid shard url", function () {
      var urlCode = faker.random.number();
      var url = faker.internet.url() + "&e=" + urlCode;
      var result = BringgSDK.getRegionCodeFromUrl(url);
      expect(result).toEqual(urlCode);
    });

    it("should return Nan from not valid url", function () {
      var url = faker.internet.url() + "&e=" + faker.name.firstName();
      var result = BringgSDK.getRegionCodeFromUrl(url);
      expect(result).toEqual(NaN);
    });
  });

  describe("setUpConfigByLocationUrl", function () {
    it("should return undefined when url is not provided", function () {
      expect(BringgSDK.setUpConfigByLocationUrl()).toEqual(undefined);
    });

    it("should return undefined when region is not found", function () {
      var url = faker.internet.url();
      expect(BringgSDK.setUpConfigByLocationUrl(url)).toEqual(undefined);
    });

    it("should setup region from valid url", function () {
      var validCode = faker.random.number({ min: 1, max: 1 });
      var url = faker.internet.url() + "&e=" + validCode;
      spyOn(BringgSDK, "getRegionCodeFromUrl").and.callThrough();
      spyOn(BringgSDK, "getRegionByCodeNumber").and.callThrough();

      expect(BringgSDK.setUpConfigByLocationUrl(url)).toEqual(true);
      expect(BringgSDK.getRegionCodeFromUrl).toHaveBeenCalledWith(url);
      expect(BringgSDK.getRegionByCodeNumber).toHaveBeenCalledWith(validCode);
    });
  });

  describe("sockets", function () {
    it("connect ", function () {
      spyOn(BringgSDK, "_connectSocket");
      spyOn(BringgSDK, "setConnectionCallbacks");
      BringgSDK.connect();

      expect(BringgSDK._connectSocket).toHaveBeenCalled();
      expect(BringgSDK.setConnectionCallbacks).toHaveBeenCalled();
    });

    it("disconnect", function () {
      var socket = {
        removeAllListeners: function () {},
        disconnect: function () {},
        connected: true,
      };

      spyOn(socket, "removeAllListeners");
      spyOn(socket, "disconnect");
      BringgSDK._socket = socket;

      BringgSDK.disconnect();

      expect(socket.removeAllListeners).toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalled();
      expect(BringgSDK._socket).toBeNull();
    });
  });

  describe("rating", function () {
    it("with invalid config", function () {
      var callback = jasmine.createSpy("callback");
      BringgSDK.setEventCallback({
        taskRatedCb: callback,
      });
      var configuration = null;
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({
        success: false,
        message: "invalid configuration",
      });

      configuration = {};
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({
        success: false,
        message: "no url or token provided for rating",
      });

      configuration = { rating_url: faker.internet.url() };
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({
        success: false,
        message: "no url or token provided for rating",
      });

      configuration = { rating_token: faker.internet.password() };
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({
        success: false,
        message: "no url or token provided for rating",
      });
    });

    it("error from server", function () {
      var callback = jasmine.createSpy("callback");
      BringgSDK.setEventCallback({
        taskRatedCb: callback,
      });

      window.$ = {
        post: function () {
          return {
            fail: function () {
              callback({
                success: false,
                message: "Unknown error while rating",
              });
            },
          };
        },
      };

      var configuration = {
        rating_url: faker.internet.url(),
        rating_token: faker.internet.password(),
      };
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({
        success: false,
        message: "Unknown error while rating",
      });
    });

    it("success from server", function () {
      var response = { success: true };
      var callback = jasmine.createSpy("callback");
      BringgSDK.setEventCallback({
        taskRatedCb: callback,
      });

      window.$ = {
        post: function (url, params, successCallback) {
          callback(response);
          return {
            fail: function () {},
          };
        },
      };

      var configuration = {
        rating_url: faker.internet.url(),
        rating_token: faker.internet.password(),
      };
      BringgSDK.setConfiguration(configuration);
      BringgSDK.submitRating(faker.random.number());
      expect(callback).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("eta", function () {
    it("calc interval should call set interval with the correct params", function () {
      spyOn(window, "setInterval");
      spyOn(window, "setTimeout");
      var interval = faker.random.number();
      BringgSDK._setETACalcInterval(interval);
      expect(window.setInterval).toHaveBeenCalledWith(
        BringgSDK._onETAIntervalSet,
        interval
      );
      expect(window.setTimeout).toHaveBeenCalledWith(
        BringgSDK._onETATimeoutSet,
        3000
      );
    });

    it("onEtaIntervalSet should clear interval if not watching driver ", function () {
      BringgSDK._setWatchingDriver(false);
      spyOn(window, "clearInterval");
      BringgSDK._onETAIntervalSet();
      expect(window.clearInterval).toHaveBeenCalled();
    });
  });

  describe("watch", function () {
    describe("order", function () {
      describe("invalid params", function () {
        it("should call external callback if missing params", function () {
          var callback = jasmine.createSpy("callback");
          BringgSDK._socket = { emit: jasmine.createSpy() };

          BringgSDK.watchOrder(undefined, callback);

          expect(BringgSDK._socket.emit).not.toHaveBeenCalled();
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.missing_params,
            error:
              "watch order failed - params must contain at least two of the following params order_uuid, share_uuid, access_token",
          });
        });

        it("should call external callback if missing order_uuid and access_token", function () {
          var callback = jasmine.createSpy("callback");
          BringgSDK._socket = { emit: jasmine.createSpy() };

          BringgSDK.watchOrder({ share_uuid: faker.random.number() }, callback);

          expect(BringgSDK._socket.emit).not.toHaveBeenCalled();
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.missing_params,
            error:
              "watch order failed - params must contain at least two of the following params order_uuid, share_uuid, access_token",
          });
        });

        it("should call external callback if missing share_uuid and access_token", function () {
          var callback = jasmine.createSpy("callback");
          BringgSDK._socket = { emit: jasmine.createSpy() };

          BringgSDK.watchOrder({ order_uuid: faker.random.number() }, callback);

          expect(BringgSDK._socket.emit).not.toHaveBeenCalled();
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.missing_params,
            error:
              "watch order failed - params must contain at least two of the following params order_uuid, share_uuid, access_token",
          });
        });

        it("should call external callback if missing share_uuid and order_uuid", function () {
          var callback = jasmine.createSpy("callback");
          BringgSDK._socket = { emit: jasmine.createSpy() };

          BringgSDK.watchOrder(
            { access_token: faker.random.number() },
            callback
          );

          expect(BringgSDK._socket.emit).not.toHaveBeenCalled();
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.missing_params,
            error:
              "watch order failed - params must contain at least two of the following params order_uuid, share_uuid, access_token",
          });
        });
      });

      it("should call socket.emit if order_uuid and share_uuid", function () {
        var callback = jasmine.createSpy("callback");
        BringgSDK._socket = { emit: jasmine.createSpy() };

        var params = {
          order_uuid: faker.random.number(),
          share_uuid: faker.random.number(),
        };
        BringgSDK.watchOrder(params, callback);
        expect(BringgSDK._socket.emit).toHaveBeenCalled();
        expect(BringgSDK._socket.emit.calls.mostRecent().args[0]).toEqual(
          "watch order"
        );
        expect(BringgSDK._socket.emit.calls.mostRecent().args[1]).toEqual(
          params
        );
      });

      it("should call socket.emit if order_uuid and access_token", function () {
        var callback = jasmine.createSpy("callback");
        BringgSDK._socket = { emit: jasmine.createSpy() };

        var params = {
          order_uuid: faker.random.number(),
          access_token: faker.random.number(),
        };
        BringgSDK.watchOrder(params, callback);
        expect(BringgSDK._socket.emit).toHaveBeenCalled();
        expect(BringgSDK._socket.emit.calls.mostRecent().args[0]).toEqual(
          "watch order"
        );
        expect(BringgSDK._socket.emit.calls.mostRecent().args[1]).toEqual(
          params
        );
      });

      it("should call socket.emit if share_uuid and access_token", function () {
        var callback = jasmine.createSpy("callback");
        BringgSDK._socket = { emit: jasmine.createSpy() };

        var params = {
          share_uuid: faker.random.number(),
          access_token: faker.random.number(),
        };
        BringgSDK.watchOrder(params, callback);
        expect(BringgSDK._socket.emit).toHaveBeenCalled();
        expect(BringgSDK._socket.emit.calls.mostRecent().args[0]).toEqual(
          "watch order"
        );
        expect(BringgSDK._socket.emit.calls.mostRecent().args[1]).toEqual(
          params
        );
      });

      describe("callback", function () {
        describe("should use external callback", function () {
          it("on no response", function () {
            var callback = jasmine.createSpy("callback");
            BringgSDK._watchOrderCb(undefined, callback);
            expect(callback).toHaveBeenCalledWith({
              success: false,
              rc: BringgSDK.RETURN_CODES.no_response,
              error: "watch order failed - no response",
            });
          });

          it("on failure", function () {
            var callback = jasmine.createSpy("callback");
            BringgSDK._watchOrderCb({}, callback);
            expect(callback).toHaveBeenCalledWith({
              success: false,
              rc: BringgSDK.RETURN_CODES.unknown_reason,
              error: "watch order failed - unknown reason",
            });
          });

          it("on expired", function () {
            var callback = jasmine.createSpy("callback");
            var result = { success: true, expired: true };
            BringgSDK._watchOrderCb(result, callback);
            expect(callback).toHaveBeenCalledWith(result);
          });

          it("on success", function () {
            var callback = jasmine.createSpy("callback");
            var result = { success: true };
            BringgSDK._watchOrderCb(result, callback);
            expect(callback).toHaveBeenCalledWith(result);
          });
        });

        it("should mark as watching order on success", function () {
          BringgSDK._setWatchingOrder(false);

          BringgSDK._watchOrderCb({ success: true });
          expect(BringgSDK.isWatchingOrder()).toBeTruthy();
        });
      });
    });

    describe("driver", function () {
      describe("invalid params", function () {
        it("should call external callback if missing params", function () {
          var callback = jasmine.createSpy("callback");
          BringgSDK._socket = { emit: jasmine.createSpy() };

          BringgSDK.watchDriver(undefined, callback);

          expect(BringgSDK._socket.emit).not.toHaveBeenCalled();
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.missing_params,
            error:
              "watch driver failed - params must contain driver_uuid and share_uuid",
          });
        });

        it("should call external callback if missing driver_uuid", function () {
          var callback = jasmine.createSpy("callback");
          BringgSDK._socket = { emit: jasmine.createSpy() };

          BringgSDK.watchDriver({}, callback);

          expect(BringgSDK._socket.emit).not.toHaveBeenCalled();
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.missing_params,
            error:
              "watch driver failed - params must contain driver_uuid and share_uuid",
          });
        });

        it("should call external callback if missing share_uuid or access_token", function () {
          var callback = jasmine.createSpy("callback");
          BringgSDK._socket = { emit: jasmine.createSpy() };

          BringgSDK.watchDriver(
            { driver_uuid: faker.random.number() },
            callback
          );

          expect(BringgSDK._socket.emit).not.toHaveBeenCalled();
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.missing_params,
            error:
              "watch driver failed - params must contain driver_uuid and share_uuid",
          });
        });
      });

      it("should call socket.emit if driver_uuid and share_uuid", function () {
        var callback = jasmine.createSpy("callback");
        BringgSDK._socket = { emit: jasmine.createSpy() };

        var params = {
          driver_uuid: faker.random.number(),
          share_uuid: faker.random.number(),
        };
        BringgSDK.watchDriver(params, callback);
        expect(BringgSDK._socket.emit).toHaveBeenCalled();
        expect(BringgSDK._socket.emit.calls.mostRecent().args[0]).toEqual(
          "watch driver"
        );
        expect(BringgSDK._socket.emit.calls.mostRecent().args[1]).toEqual(
          params
        );
      });

      describe("callback", function () {
        it("should use external callback on failure", function () {
          var callback = jasmine.createSpy("callback");
          BringgSDK._watchDriverCb({}, callback);
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.unknown_reason,
            error: "failed watching driver",
          });

          BringgSDK._watchDriverCb(undefined, callback);
          expect(callback).toHaveBeenCalledWith({
            success: false,
            rc: BringgSDK.RETURN_CODES.no_response,
            error: "failed watching driver",
          });
        });

        it("should use external callback on success", function () {
          var callback = jasmine.createSpy("callback");
          var result = { success: true };
          BringgSDK._watchDriverCb(result, callback);
          expect(callback).toHaveBeenCalledWith(result);
        });

        it("should set eta calculation interval on success", function () {
          spyOn(BringgSDK, "_setETACalcInterval");
          BringgSDK._watchDriverCb({ success: true });
          expect(BringgSDK._setETACalcInterval).toHaveBeenCalled();
        });
      });
    });

    describe("waypoint", function () {
      it("should use callback on failure", function () {
        var callback = jasmine.createSpy("callback");
        BringgSDK._watchWayPointCb({}, callback);
        expect(callback).toHaveBeenCalledWith({
          success: false,
          rc: BringgSDK.RETURN_CODES.unknown_reason,
          error: "failed watching waypoint",
        });

        BringgSDK._watchWayPointCb(undefined, callback);
        expect(callback).toHaveBeenCalledWith({
          success: false,
          rc: BringgSDK.RETURN_CODES.no_response,
          error: "failed watching waypoint",
        });
      });

      it("should use callback on success", function () {
        var callback = jasmine.createSpy("callback");
        var result = { success: true };
        BringgSDK._watchWayPointCb(result, callback);
        expect(callback).toHaveBeenCalledWith(result);
      });
    });
  });

  describe("set watching", function () {
    it("should mark driver watched accordingly", function () {
      BringgSDK._setWatchingDriver(false);
      expect(BringgSDK.isWatchingDriver()).toBeFalsy();
      BringgSDK._setWatchingDriver(true);
      expect(BringgSDK.isWatchingDriver()).toBeTruthy();
      BringgSDK._setWatchingDriver(false);
      expect(BringgSDK.isWatchingDriver()).toBeFalsy();
    });

    it("should mark order watched accordingly", function () {
      BringgSDK._setWatchingOrder(false);
      expect(BringgSDK.isWatchingOrder()).toBeFalsy();
      BringgSDK._setWatchingOrder(true);
      expect(BringgSDK.isWatchingOrder()).toBeTruthy();
      BringgSDK._setWatchingOrder(false);
      expect(BringgSDK.isWatchingOrder()).toBeFalsy();
    });
  });

  describe("onNewConfiguration", function () {
    it("should set eta calc interval if already watching driver", function () {
      spyOn(BringgSDK, "_setETACalcInterval");
      spyOn(BringgSDK, "_setDriverActivity");
      BringgSDK._setWatchingDriver(true);
      BringgSDK._onNewConfiguration({});
      expect(BringgSDK._setETACalcInterval).toHaveBeenCalled();
    });

    it("should not set eta calc interval if not watching driver", function () {
      spyOn(BringgSDK, "_setETACalcInterval");
      spyOn(BringgSDK, "_setDriverActivity");
      BringgSDK._setWatchingDriver(false);
      BringgSDK._onNewConfiguration({});
      expect(BringgSDK._setETACalcInterval).not.toHaveBeenCalled();
    });

    it("should call disconnect if shared location is expired", function () {
      spyOn(BringgSDK, "disconnect");
      BringgSDK._onNewConfiguration({ expired: true });
      expect(BringgSDK.disconnect).toHaveBeenCalled();
    });

    it("should not call disconnect if shared location is valid", function () {
      spyOn(BringgSDK, "disconnect");
      spyOn(BringgSDK, "_setDriverActivity");
      BringgSDK._onNewConfiguration({});
      expect(BringgSDK.disconnect).not.toHaveBeenCalled();
    });
  });

  describe("setDriverActivity", function () {
    it("should set driver activity to walking", function () {
      window.google = {
        maps: {
          TravelMode: {
            WALKING: "walking",
            DRIVING: "driving",
          },
        },
      };

      BringgSDK.setDriverActivity(2);

      expect(BringgSDK.getDriverActivity()).toEqual("walking");
    });

    it("should set driver activity to driving", function () {
      window.google = {
        maps: {
          TravelMode: {
            WALKING: "walking",
            DRIVING: "driving",
          },
        },
      };

      BringgSDK.setDriverActivity(5);

      expect(BringgSDK.getDriverActivity()).toEqual("driving");
    });
  });

  describe("getDriverPhone", function () {
    it("should fail if shared_uuid is not passed", function () {
      spyOn(window.$, "get");

      var result;
      BringgSDK.getDriverPhone(null, null, function (res) {
        result = res;
      });

      expect(window.$.get).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "error",
        message: "No shared_uuid provided",
        rc: 4,
      });
    });

    it("should call the callback with the result on success", function () {
      var fakeResult = {
        success: true,
        phone_number: faker.phone.phoneNumber(),
      };
      spyOn(window.$, "get").and.callFake(function () {
        return {
          success: function (callback) {
            callback(fakeResult);
            return {
              fail: function () {},
            };
          },
        };
      });

      var getDriverPhoneResult;
      BringgSDK.getDriverPhone(faker.random.number(), null, function (res) {
        getDriverPhoneResult = res;
      });

      expect(window.$.get).toHaveBeenCalled();
      expect(getDriverPhoneResult).toEqual(fakeResult);
    });

    it("should call the callback with the result on error", function () {
      var fakeResult = {
        responseText: JSON.stringify({ success: false, message: 123 }),
      };
      spyOn(window.$, "get").and.callFake(function () {
        return {
          success: function () {
            return {
              fail: function (callback) {
                callback(fakeResult);
              },
            };
          },
        };
      });

      var getDriverPhoneError;
      var uuid = faker.random.number();
      BringgSDK.getDriverPhone(uuid, null, function (res) {
        getDriverPhoneError = res;
      });

      expect(window.$.get).toHaveBeenCalledWith(
        BringgSDK._getRealtimeOptions().END_POINT +
          "/shared/" +
          uuid +
          "/phone_number",
        { original_phone: null }
      );
      expect(getDriverPhoneError).toEqual({
        status: "error",
        message: JSON.parse(fakeResult.responseText),
      });
    });

    it("should send the customerPhone to backend if provided", function () {
      var fakeResult = {
        success: true,
        phone_number: faker.phone.phoneNumber(),
      };
      spyOn(window.$, "get").and.callFake(function () {
        return {
          success: function (callback) {
            callback(fakeResult);
            return {
              fail: function () {},
            };
          },
        };
      });

      var getDriverPhoneResult;
      var phoneNumber = faker.phone.phoneNumber();
      var uuid = faker.random.number();
      BringgSDK.getDriverPhone(uuid, phoneNumber, function (res) {
        getDriverPhoneResult = res;
      });

      expect(window.$.get).toHaveBeenCalledWith(
        BringgSDK._getRealtimeOptions().END_POINT +
          "/shared/" +
          uuid +
          "/phone_number",
        { original_phone: phoneNumber }
      );
      expect(getDriverPhoneResult).toEqual(fakeResult);
    });
  });
});
