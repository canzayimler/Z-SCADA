import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Columns} from '../apps/web/src/ReportCharts';
/* Denetim 2026-11-18: vardiya raporu boş veride histogram eksenini "1 / 2" çiziyordu. */
const h=3600000,t0=Date.UTC(2026,10,18,6);
const buckets=(counts:number[])=>counts.map((count,i)=>({from:t0+i*h,to:t0+(i+1)*h,count}));
test('Columns bos veride eksen yerine bos durum gosterir',()=>{
 const html=renderToStaticMarkup(createElement(Columns,{buckets:buckets([0,0,0,0]),unit:'giriş'}));
 assert.ok(!html.includes('columns-grid'),'eksen cizilmemeli');
 assert.match(html,/Bu aralıkta giriş yok\./);
 assert.match(renderToStaticMarkup(createElement(Columns,{buckets:[],unit:'alarm'})),/alarm yok/);
});
test('Columns veri varken ust siniri cift sayiya yuvarlar',()=>{
 const html=renderToStaticMarkup(createElement(Columns,{buckets:buckets([1,5,0,2]),unit:'giriş'}));
 assert.match(html,/<span>6<\/span>/);assert.match(html,/<span>3<\/span>/);
});
