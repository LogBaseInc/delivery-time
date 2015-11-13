var express = [];
var signature = [];
var handcraft = [];

var errorExpress = [];
var errorSignature = [];
var errorHandcraft = [];

window.addEventListener("DOMContentLoaded", function() {

    $("#productdiv").hide();

    $.get( "/shopify/products", function( data ) {
        for(var i=0; i < data.products.length; i++) {
            var product = data.products[i];
            if(product.published_at != null) {
                if(product.product_type == "Bee's Xpress"){
                    express.push(product);
                }
                else if(product.product_type == "Signature Bee's") {
                    signature.push(product);
                }
                else if(product.product_type == "Handcrafted Bee's"){
                    handcraft.push(product);
                }
            }
        }

        console.log('express: ' + express.length);
        console.log('signature: ' + signature.length);
        console.log('handcraft: ' + handcraft.length);

        $("#productdiv").append( "" );

        errorExpress = validateProducts(express, true);
        appendErrors("Bee's Xpress", errorExpress);

        errorSignature = validateProducts(signature, false);
        appendErrors("Signature Bee's", errorSignature);

        errorHandcraft = validateProducts(signature, false);
        appendErrors("Handcrafted Bee's", errorHandcraft);

        $("#loadimg").hide();
        $("#productdiv").show();
    });
}, false);

function validateProducts(productlist, isXpress) {
    var errors = [];

    for(var i=0; i < productlist.length; i++) {
        var productname = productlist[i].title;
        var flavoursarray = filterOptions(productlist[i].options, isXpress ? "Egg/Eggless": "Flavours");
        var sizesarray = filterOptions(productlist[i].options, "Size(Kg)");
        var sku = null;

        if(flavoursarray.length >0 && sizesarray.length > 0) {

            var flavours = flavoursarray[0].values;
            var sizes = sizesarray[0].values;

            for(var f=0 ; f < flavours.length; f++) {
                var onekgprice = 0;
                for(var s=0; s< sizes.length; s++) {
                    var size = sizes[s];
                    var flavour = flavours[f];

                    var title = size +" / " + flavour;
                    var variantArray = filterVariants(productlist[i].variants, title);

                    if(variantArray.length > 0) {
                        var variant = variantArray[0];
                        
                        if(variant.sku == null || variant.sku == undefined || variant.sku == "" || variant.sku == " ") {
                            errors.push({name: productname +", "+title, error: "No SKU available"});
                        }
                        else if(sku == null) {
                            sku = variant.sku;
                        }
                        else if(variant.sku != sku) {
                            errors.push({name: productname +", "+title, error: "Different SKU. Original SKU: "+variant.sku+", Cross check:"+ sku});
                        }

                        if(variant.price >= 350) {
                            var sizenumber = parseFloat(size);
                            if(onekgprice == 0 ) {
                                onekgprice = parseInt(variant.price);

                                if(sizenumber == 0.5) {
                                    onekgprice = onekgprice - 50;
                                }

                                if(!((onekgprice%10) == 0)) {
                                   onekgprice = onekgprice + 5.00; 
                                }

                                onekgprice = (onekgprice / sizenumber);

                                //console.log(errorProduct.title +", " + title + " - 1 kg price "+ onekgprice + ", original price: "+variant.price + " original size: " + size);
                            }
                            //validate product
                            else {
                                var calculatedprice = ((onekgprice * sizenumber) -5);

                                if(calculatedprice != parseInt(variant.price)) {
                                    errors.push({name: productname +", "+title, error : "Mismatch in price. Original price: " + variant.price + ", Calculated price: " + calculatedprice});
                                }
                            }
                        }
                        else {
                           errors.push({name: productname +", "+title, error: "Price less than 350. Original price: " + variant.price});
                        }
                       
                    }
                    else {
                        errors.push({name: productname +", "+title, error: "No variant available"});
                    }
                }
            }
        }
        else {
            if(isXpress) 
                errors.push({name: productname, error: "Either egg/eggless or size is not found. Egg/Eggless: "+ flavoursarray.length + ", Sizes: " + sizesarray.length});
            else
                errors.push({name: productname, error: "Either flavours or size is not found. Flavours: "+ flavoursarray.length + ", Sizes: " + sizesarray.length});
        }
    }
    return errors;
}

function filterOptions(options, filertext){
    return $.grep(options, function(a) {
        return a.name == filertext;
    });
}

function filterVariants(variants, filtertext) {
    return $.grep(variants, function(a) {
        return a.title == filtertext;
    });
}

function appendErrors (header, errors){
    $("#productdiv").append( "<h2>"+header+"</h2>" );
    if(errors.length == 0) {
        $("#productdiv").append("<span>All products and variants are correct !!!</span>");
    }
    else {
        for(var i=0; i< errors.length; i++) {
            $("#productdiv").append("<span>Name: "+ errors[i].name+", Error: "+ errors[i]. error+"</span></br></br>");
        }
    }
    $("#productdiv").append( "</br></br>" );
}