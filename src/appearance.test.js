import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appearancePalette,DEFAULT_BACKGROUND} from '../shared/theme.js';
import {themeColors} from '../shared/theme-colors.js';
const rgb=hex=>hex.slice(1,7).match(/../g).map(v=>parseInt(v,16));
const luminance=hex=>rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
test('la palette conserve les textes clairs et colore chaque niveau de surface',()=>{
 const blue=appearancePalette('#12152b',themeColors),red=appearancePalette('#2b1212',themeColors);
 assert.deepEqual(appearancePalette(DEFAULT_BACKGROUND,themeColors),{});assert.deepEqual(appearancePalette('bad',themeColors),{});
 for(const original of ['111110','1b1b18','24241f','49402d','c8ab78']){assert.ok(blue['--theme-'+original]);assert.notEqual(blue['--theme-'+original],red['--theme-'+original]);}
 assert.equal(blue['--theme-e4dfd2'],'#e4dfd2');
 const text=luminance('#e4dfd2');for(const source of ['111110','1b1b18','24241f'])assert.ok((text+.05)/(luminance(blue['--theme-'+source])+.05)>7);
 for(const original of ['111110','1b1b18'])assert.ok(luminance(blue['--theme-'+original])<luminance(blue['--theme-24241f']));
 assert.equal(blue['--theme-0003'].slice(-2),'33');
 for(const original of ['a99b7e','aaa79c','969080'])assert.ok(Math.abs(luminance(blue['--theme-'+original])-luminance('#'+original))<.005);
 const button=blue['--appearance-primary'],ink=blue['--appearance-primary-ink'];assert.notEqual(button,red['--appearance-primary']);assert.ok((luminance(button)+.05)/(luminance(ink)+.05)>7);
});
