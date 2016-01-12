# customer-js-sdk


## getting started

### install
bower install bringg-js-sdk


## api

### main methods

##### initializaBringg (params, [initDoneCb])
this is an optional setup function. params can be used to pass credentials (like dev_access_token and customer_access_token) and other like share_uuid if client already holds a reference to it and compatibility with html customer_app.

if share uuid is provided, after fetching the shared-location config it will connect the realtime, polling etc.

`if the params include the necessary data for watchOrder, it will be called automatically when realtime connection is established.`


##### connect ([customerAccessToken],[onConnectCb],[onDisconnectCb])
connect to the realtime.

connection callbacks are optional since you can independently set the onConnect/onDisconnect via setter functions.

the access token is also optional at this point.


##### disconnect()
closes the real-time connection.


##### watchOrder(params, callback)
start tracking an order

`params`:
```
{
  order_uuid: "",
  share_uuid: "",
  [optional]way_point_id: ""
}
```

`after calling this method there is no need to call the watchDriver and watchWaypoint as the sdk will figure by himself when it can do so. see setAutoWatchDriver and setAutoWatchWayPoint if you want to call them manually.`



##### watchDriver(params, callback)

`params`:
```
{
  driver_uuid: "",
  share_uuid: ""
}
```

##### watchWayPoint(params, callback)

`params`:
```
{
  order_uuid: "",
  way_point_id: ""
}
```


### additional optional actions

##### submitRating(rating)

##### submitRatingReason(ratingReasonId)

##### submitNote(note)

##### submitLocation(position, successCb, failureCb)

##### submitTip(tip)


### setting callbacks

##### setConnectionCallbacks(onConnectCb, onDisconnectCb)

##### setOrderUpdateCb

##### setLocationUpdateCb

##### setETAUpdateCb(cb)

##### setETAMethodChangedCb(cb)


### optional setters

##### setConfiguration(sharedLocationConfiguration)

##### setDestination(lat, lng)
set the destination for the order (i.e the customer's location).
###### the destination is needed for eta calculations.

##### setETAMethod(newETAMethod)


### other

##### getLastKnownETA()
##### setAutoWatchDriver(enable)
##### setAutoWatchWayPoint(enable)


## examples
