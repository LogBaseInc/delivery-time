### Delivery Time API server

===========================

Before starting set below environment variables:


API_PORT (default 9000)

SHOPIFY_API_KEY

SHOPIFY_SHARED_SECRET

REDIRECT_URI


=============================

###### Install App API:

GET /shopify/{shop}

	shop - myshop.shopify.com



###### Shopify Callback API:

GET /shopify/oauth/callback?{query_params}

	query_params - will be populated by Shopify




=============================

###### Html to paste:

<!--Abishek: LogBase Delivery Time Starts-->
<div align="right" id="lbdt">
<br/>
Pick a Delivery Time
<br/><br/>
<div style="width: 200px">
  <select id = "lbdt-day">
  </select>
  <select id= "lbdt-time">
  </select>
</div>
<br/>
</div>
<!--Abishek: LogBase Delivery Time Ends-->
