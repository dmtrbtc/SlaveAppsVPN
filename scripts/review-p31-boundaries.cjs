const fs=require('node:fs'),path=require('node:path'),Module=require('node:module')
const root=path.resolve(__dirname,'..')
const filename=path.join(root,'apps/windows/test/windowsLifecycle.test.cjs')
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename))
const source=fs.readFileSync(filename,'utf8').replace("const { test } = require('node:test')","const test = () => {}")
mod._compile(source+'\nmodule.exports={runtimeFixture};',filename)
const core=require(path.join(root,'packages/core/dist/cjs/index.js'))
async function main(){
 const result={}
 const saved=global.structuredClone
 try{global.structuredClone=undefined;new core.SettingsStore({});result.noStructuredClone='supported'}catch(e){result.noStructuredClone=e.name}finally{global.structuredClone=saved}
 let release;const gate=new Promise(r=>{release=r});let persisted=false
 const store=new core.SettingsStore({get:async()=>null,set:async()=>{await gate;persisted=true}},core.createDefaultSettings({selectedProxy:'Manual',notificationsEnabled:false}))
 const f=await mod.exports.runtimeFixture('Manual',store)
 let checks=0,write
 f.service.waitForSettings=async()=>{
   const snapshot=await store.waitForPersistence()
   if(++checks===2)queueMicrotask(()=>{write=store.patch({selectedProxy:'UNSAVED'})})
   return snapshot
 }
 await f.service.notifySubscriptionsChanged()
 result.engineAppliedUnsavedSelection=f.applied.at(-1).selectedProxy==='UNSAVED' && !persisted
 release();await write
 fs.writeFileSync(path.join(root,'docs/P31_FINAL_REVIEW_REPRO.json'),JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify(result))
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
