///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
    'dojo/_base/declare',
    'dojo/_base/array',
    'dojo/_base/html',
    'dojo/_base/lang',
    'dojo/query',
    'dojo/on',
    'dijit/_WidgetsInTemplateMixin',
    'jimu/BaseWidget',
    'jimu/filterUtils',
    'jimu/dijit/FilterParameters',
    'jimu/LayerInfos/LayerInfos',
    'jimu/FilterManager',
    'esri/request',
    'esri/graphicsUtils',
    'esri/tasks/query',
    'esri/layers/FeatureLayer',
    'dojo/NodeList',
    'dojo/NodeList-dom'
  ],
  function(declare, array, html, lang, query, on,
    _WidgetsInTemplateMixin,
    BaseWidget, FilterUtils, FilterParameters, LayerInfos, FilterManager,
    esriRequest, graphicsUtils, Query, FeatureLayer) {

    return declare([BaseWidget, _WidgetsInTemplateMixin], {
      name: 'eFilter',
      baseClass: 'jimu-widget-filter',

      _itemTemplate: '<li class="filter-item" data-index="${index}">' +
        '<div class="header jimu-leading-padding1" >' +
          '<span class="icon jimu-trailing-margin05">' +
            '<img src="${icon}" />' +
          '</span>' +
          '<span class="item-title">${title}</span>' +
          '<span class="done jimu-float-trailing jimu-leading-margin1"></span>' +
          '<span class="setting jimu-float-trailing" ' +
          'title="${toggleTip}" style="display:${hasValue}"></span>' +
        '</div>' +
        '<div class="body">' +
          '<div class="parameters"></div>' +
          '<span class="jimu-btn apply jimu-float-trailing jimu-trailing-margin25">' +
          '${apply}</span>' + '<span class="jimu-btn zoom jimu-float-trailing jimu-trailing-margin25">' +
          '${zoom}</span>' +
        '</div>' +
      '</li>',
      _store: null,

      postCreate: function(){
        this.inherited(arguments);
        this._store = {};
        this.layerInfosObj = LayerInfos.getInstanceSync();
        this.filterUtils = new FilterUtils();
        this.filterManager = FilterManager.getInstance();

        var filters = this.config.filters;
        array.forEach(filters, function(filterObj, idx) {
          var isAskForValue = this.filterUtils.isAskForValues(filterObj.filter);

          var parse = {
            icon: filterObj.icon ? filterObj.icon :
              this.folderUrl + '/css/images/default_task_icon.png',
            index: idx,
            title: filterObj.name,
            toggleTip: this.nls.toggleTip,
            hasValue: isAskForValue ?
              (window.appInfo.isRunInMobile ? 'block !important' : '') : 'none',
            isAskForValue: isAskForValue,
            apply: lang.getObject('jimuNls.common.apply', false, window) || 'Apply',
            zoom: lang.getObject('jimuNls.common.zoom', false, window) || 'Zoom To'
          };
          
          if (!this._store[filterObj.layerId]) {
            this._store[filterObj.layerId] = {};
          }

          var template = lang.replace(this._itemTemplate, parse, /\$\{([^\}]+)\}/ig);
          var node = html.toDom(template);
          html.place(node, this.filterList);
          this.own(
            query('.header', node)
            .on('click', lang.hitch(this, 'enableFilter', node, filterObj, parse))
          );
          if (parse.hasValue !== 'none') {
            // add parameters
            this.own(
              query('.setting', node)
              .on('click', lang.hitch(this, 'configFilter', node, filterObj))
            );
            this.own(
              query('.apply', node)
              .on('click', lang.hitch(this, 'applyFilterValues', node, filterObj))
            );
            this.own(
              query('.zoom', node)
              .on('click', lang.hitch(this, 'zoomToFilterSet', node, filterObj))
            );
            if (!filterObj.zoom) {
              query('.zoom', node).style("display", "none");
              console.log(query('.zoom', node));
            };
            html.addClass(node, 'requesting');
            this.configFilter(node, filterObj);
          }
        }, this);
      },

      startup: function() {
        this.inherited(arguments);
        this.resize();
     
      },

      _setItemFilter: function(layerId, idx, expr) {
        this._store[layerId]['filter_item_' + idx] = expr;
      },

      _removeItemFilter: function(layerId, idx) {
        delete this._store[layerId]['filter_item_' + idx];
      },

      _getExpr: function(layerId) {
        if (!this._store[layerId]) {
          return null;
        }

        var parts = [];
        var exprs = this._store[layerId];

        for (var p in exprs) {
          var expr = exprs[p];
          if (expr) {
            parts.push('(' + expr + ')');
          }
        }

        return parts.join(' AND ');
      },

      _bindMapUpdateEvents: function(node, needApply) {
        on.once(this.map, 'update-start', lang.hitch(this, function() {
          html.addClass(node, 'applying');
        }));
        on.once(this.map, 'update-end', lang.hitch(this, function() {
          if (!needApply) {
            html.removeClass(node, 'applied');
          } else {
            html.addClass(node, 'applied');
          }
          html.removeClass(node, 'applying');
        }));
      },

      enableFilter: function(node, filterObj, parse) {
        if (html.hasClass(node, 'config-parameters') &&
          !(node.filterParams && node.filterParams.getFilterExpr())) {
          return;
        }
        if (parse.isAskForValue && !(node.filterParams && node.filterParams.getFilterExpr())) {
          this.configFilter(node, filterObj);
          return;
        }
        var layerId = filterObj.layerId;
        var idx = html.getAttr(node, 'data-index');
        var layerFilterExpr = null;

        var layerInfo = this.layerInfosObj.getLayerInfoById(layerId);
        var applied = html.hasClass(node, 'applied');
        if (layerInfo.isShowInMap() && layerInfo.isInScale()) {
          this._bindMapUpdateEvents(node, !applied ? true : false);
        } else {
          if (applied) {
            html.removeClass(node, 'applied');
          } else {
            html.addClass(node, 'applied');
          }
        }

        if (!applied) {
          this._setItemFilter(layerId, idx, node.filterParams ?
            node.filterParams.getFilterExpr() : filterObj.filter.expr);
          layerFilterExpr = this._getExpr(layerId);
          this.filterManager.applyWidgetFilter(layerId, this.id, layerFilterExpr);
        } else {
          this._removeItemFilter(layerId, idx);
          layerFilterExpr = this._getExpr(layerId);
          this.filterManager.applyWidgetFilter(layerId, this.id, layerFilterExpr);
        }
      },

      configFilter: function(node, filterObj, evt) {
        if (!node.filterParams) {
          esriRequest({
            url: filterObj.url,
            content: {
              f: 'json'
            },
            handleAs: 'json',
            callbackPrams: 'callback'
          }).then(lang.hitch(this, function(definition) {
            html.addClass(node, 'config-parameters');
            html.removeClass(node, 'requesting');
            var pamDiv = query('.parameters', node)[0];
            node.handles = [];
            node.filterParams = new FilterParameters();
            var partsObj = lang.clone(filterObj.filter);
            node.filterParams.build(filterObj.url, definition, partsObj);

            this.own(on(node.filterParams, 'change', lang.hitch(this, function(expr) {
              if (expr) {
                query('.apply', node).removeClass('disable-apply');
                node.expr = expr;
              } else {
                delete node.expr;
                query('.apply', node).addClass('disable-apply');
              }
            })));

            node.expr = node.filterParams.getFilterExpr();
            if (node.expr) {
              query('.apply', node).removeClass('disable-apply');
            } else {
              delete node.expr;
              query('.apply', node).addClass('disable-apply');
            }
            node.filterParams.placeAt(pamDiv);
            this._changeItemTitleWidth(node, 60);
          }));
        } else {
          if (!html.hasClass(node, 'config-parameters')) {
            html.addClass(node, 'config-parameters');
            this._changeItemTitleWidth(node, 60);
          } else {
            html.removeClass(node, 'config-parameters');
            this._changeItemTitleWidth(node, window.appInfo.isRunInMobile ? 60 : 45);
          }
        }

        if (evt && evt.target) {
          evt.stopPropagation();
        }
      },

      applyFilterValues: function(node, filterObj, evt) {
        var expr = node.filterParams && (node.expr || node.filterParams.getFilterExpr());
        if (expr) {
          node.expr = expr;
          // getFilterExpr
          var layerId = filterObj.layerId;
          var idx = html.getAttr(node, 'data-index');
          var layerInfo = this.layerInfosObj.getLayerInfoById(layerId);
          if (layerInfo.isShowInMap() && layerInfo.isInScale()) {
            this._bindMapUpdateEvents(node, true);
          } else {
            html.addClass(node, 'applied');
          }
          this._setItemFilter(layerId, idx, node.expr);
          var layerFilterExpr = this._getExpr(layerId);
          this.filterManager.applyWidgetFilter(layerId, this.id, layerFilterExpr);
          this.filterManager.applyWidgetFilter("DTIP_Tasks_9533_0", this.id, layerFilterExpr);
        }

        evt.stopPropagation();
      },
      zoomToFilterSet: function(node, filterObj, evt) {
        console.log("zoom");
        var expr = node.filterParams && (node.expr || node.filterParams.getFilterExpr());
        if (expr) {
          //node.expr = expr;
          // getFilterExpr
          var layerId = filterObj.layerId;
          var idx = html.getAttr(node, 'data-index');
          var layerInfo = this.layerInfosObj.getLayerInfoById(layerId);
         
          var query = new Query();
          var layer = new FeatureLayer(layerInfo.layerObject.url);
          var map = this.map;
          
          query.where = expr;
     
          layer.queryFeatures(query, function(featureSet){

            map.setExtent(graphicsUtils.graphicsExtent(featureSet.features).expand(2));

            }, this);
        }

      },
      resize: function() {
        this.inherited(arguments);
        this._changeItemTitleWidth(this.domNode, window.appInfo.isRunInMobile ? 60 : 45);
      },

      _changeItemTitleWidth: function(node, tolerace) {
        var itemHeader = query('.header', node)[0];
        if (itemHeader) {
          var contentBox = html.getContentBox(itemHeader);
          var maxWidth = contentBox.w - tolerace;// width of header minus others width
          if (maxWidth > 0) {
            query('.header .item-title', node).style({
              'maxWidth': maxWidth + 'px'
            });
          }
        }
      },

      destroy: function(){
        query('.filter-item', this.filterList).forEach(function(node) {
          delete node.filterParams;
          delete node.expr;
        });
        if (this._store) {
          for (var p in this._store) {
            if (p) {
              this.filterManager.applyWidgetFilter(p, this.id, "");
            }
          }
        }
        this.inherited(arguments);
      }
    });
  });