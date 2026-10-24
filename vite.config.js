import {defineConfig} from 'vite';
const proxy=Object.fromEntries(['/api'].map(path=>[path,{target:'http://127.0.0.1:3001',changeOrigin:false}]));
export default defineConfig({server:{host:'0.0.0.0',port:5173,strictPort:true,proxy}});
