// ==UserScript==
// @name         Torn Bazaar Customer CRM
// @namespace    manic-mike.torn.crm
// @version      7.0.0
// @description  Permanent loader for the Torn Bazaar Customer CRM runtime with verified in-CRM updates and rollback.
// @updateURL    https://raw.githubusercontent.com/tuccijr75/privacy-policy/torn-bazaar-crm/Torn_Bazaar_Customer_CRM.user.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/privacy-policy/torn-bazaar-crm/Torn_Bazaar_Customer_CRM.user.js
// @match        https://www.torn.com/*
// @match        https://weav3r.dev/travel-stock*
// @match        https://www.weav3r.dev/travel-stock*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @connect      weav3r.dev
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// ==/UserScript==

(async () => {
    'use strict';

    const LOADER_VERSION='7.0.0';
    const MANIFEST_URL='https://raw.githubusercontent.com/tuccijr75/privacy-policy/torn-bazaar-crm/crm-manifest.json';
    const CURRENT_SOURCE_KEY='mm_bazaar_crm_runtime_current_v1';
    const CURRENT_META_KEY='mm_bazaar_crm_runtime_current_meta_v1';
    const PREVIOUS_SOURCE_KEY='mm_bazaar_crm_runtime_previous_v1';
    const PREVIOUS_META_KEY='mm_bazaar_crm_runtime_previous_meta_v1';
    const LOADER_STATE_KEY='mm_bazaar_crm_loader_state_v1';

    const textFetch=(url,accept='text/plain')=>new Promise((resolve,reject)=>{
        GM_xmlhttpRequest({
            method:'GET',
            url:url+(url.includes('?')?'&':'?')+'t='+Date.now(),
            timeout:20000,
            headers:{Accept:accept},
            onload:r=>{
                if(r.status<200||r.status>=300)return reject(new Error('HTTP '+r.status+' for '+url));
                resolve(String(r.responseText||''));
            },
            ontimeout:()=>reject(new Error('Request timed out: '+url)),
            onerror:()=>reject(new Error('Network error: '+url))
        });
    });

    async function sha256(text){
        const bytes=new TextEncoder().encode(String(text||''));
        const digest=await crypto.subtle.digest('SHA-256',bytes);
        return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }

    async function fetchManifest(){
        const raw=await textFetch(MANIFEST_URL,'application/json');
        const data=JSON.parse(raw);
        if(!data?.version||!data?.bundle?.url||!/^[a-f0-9]{64}$/i.test(String(data.bundle.sha256||''))){
            throw new Error('CRM release manifest is invalid.');
        }
        return data;
    }

    function runtimeVersion(source){
        const m=String(source||'').match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
        return m?String(m[1]):'';
    }

    function compileRuntime(source){
        return new Function(
            'GM_xmlhttpRequest','GM_getValue','GM_setValue','GM_deleteValue',
            String(source||'')+'\n//# sourceURL=mm-bazaar-crm-runtime.js'
        );
    }

    async function downloadVerified(manifest){
        const source=await textFetch(manifest.bundle.url,'text/javascript,text/plain');
        const actual=await sha256(source);
        const expected=String(manifest.bundle.sha256||'').toLowerCase();
        if(actual!==expected)throw new Error('CRM runtime SHA-256 verification failed.');
        const version=runtimeVersion(source);
        if(version!==String(manifest.version))throw new Error('CRM runtime version does not match release manifest.');
        compileRuntime(source);
        return {source,meta:{version,sha256:actual,url:manifest.bundle.url,verifiedAt:Date.now()}};
    }

    function context(){
        const current=GM_getValue(CURRENT_META_KEY,{})||{};
        const previous=GM_getValue(PREVIOUS_META_KEY,{})||{};
        const state=GM_getValue(LOADER_STATE_KEY,{})||{};
        return {
            loaderVersion:LOADER_VERSION,
            activeVersion:String(current.version||''),
            previousVersion:String(previous.version||''),
            latestVersion:String(state.latestVersion||''),
            lastHealthyVersion:String(state.lastHealthyVersion||'')
        };
    }

    function publishContext(){
        globalThis.__MM_CRM_LOADER_CONTEXT__=context();
    }

    async function checkForUpdate(){
        const manifest=await fetchManifest();
        const current=GM_getValue(CURRENT_META_KEY,{})||{};
        const state=GM_getValue(LOADER_STATE_KEY,{})||{};
        state.latestVersion=String(manifest.version);
        state.lastCheckAt=Date.now();
        GM_setValue(LOADER_STATE_KEY,state);
        publishContext();
        return {
            currentVersion:String(current.version||''),
            latestVersion:String(manifest.version),
            available:String(manifest.version)!==String(current.version||'')
        };
    }

    async function updateNow(){
        const manifest=await fetchManifest();
        const currentMeta=GM_getValue(CURRENT_META_KEY,{})||{};
        if(String(currentMeta.version||'')===String(manifest.version)){
            const state=GM_getValue(LOADER_STATE_KEY,{})||{};
            state.latestVersion=String(manifest.version);
            state.lastCheckAt=Date.now();
            GM_setValue(LOADER_STATE_KEY,state);
            publishContext();
            return {changed:false,message:'CRM runtime v'+manifest.version+' is already active.'};
        }

        const next=await downloadVerified(manifest);
        const currentSource=GM_getValue(CURRENT_SOURCE_KEY,'');
        if(currentSource){
            GM_setValue(PREVIOUS_SOURCE_KEY,currentSource);
            GM_setValue(PREVIOUS_META_KEY,currentMeta);
        }
        GM_setValue(CURRENT_SOURCE_KEY,next.source);
        GM_setValue(CURRENT_META_KEY,next.meta);

        const state=GM_getValue(LOADER_STATE_KEY,{})||{};
        state.latestVersion=String(manifest.version);
        state.lastUpdateAt=Date.now();
        GM_setValue(LOADER_STATE_KEY,state);
        publishContext();
        return {changed:true,message:'CRM runtime v'+manifest.version+' verified and staged.'};
    }

    async function rollback(){
        const previousSource=GM_getValue(PREVIOUS_SOURCE_KEY,'');
        const previousMeta=GM_getValue(PREVIOUS_META_KEY,{})||{};
        if(!previousSource||!previousMeta.version)throw new Error('No previous CRM runtime is cached.');

        compileRuntime(previousSource);
        const currentSource=GM_getValue(CURRENT_SOURCE_KEY,'');
        const currentMeta=GM_getValue(CURRENT_META_KEY,{})||{};

        GM_setValue(CURRENT_SOURCE_KEY,previousSource);
        GM_setValue(CURRENT_META_KEY,previousMeta);
        GM_setValue(PREVIOUS_SOURCE_KEY,currentSource);
        GM_setValue(PREVIOUS_META_KEY,currentMeta);

        const state=GM_getValue(LOADER_STATE_KEY,{})||{};
        state.lastRollbackAt=Date.now();
        GM_setValue(LOADER_STATE_KEY,state);
        publishContext();
        return {changed:true,message:'CRM runtime v'+previousMeta.version+' restored.'};
    }

    function markHealthy(version){
        const state=GM_getValue(LOADER_STATE_KEY,{})||{};
        state.lastHealthyVersion=String(version||'');
        state.lastHealthyAt=Date.now();
        GM_setValue(LOADER_STATE_KEY,state);
        publishContext();
    }

    globalThis.__MM_CRM_LOADER_API__=Object.freeze({
        checkForUpdate,
        updateNow,
        rollback,
        markHealthy,
        context
    });

    async function bootstrap(){
        let source=GM_getValue(CURRENT_SOURCE_KEY,'');
        let meta=GM_getValue(CURRENT_META_KEY,{})||{};

        if(!source){
            const manifest=await fetchManifest();
            const initial=await downloadVerified(manifest);
            source=initial.source;
            meta=initial.meta;
            GM_setValue(CURRENT_SOURCE_KEY,source);
            GM_setValue(CURRENT_META_KEY,meta);
            const state=GM_getValue(LOADER_STATE_KEY,{})||{};
            state.latestVersion=String(manifest.version);
            state.firstInstallAt=state.firstInstallAt||Date.now();
            GM_setValue(LOADER_STATE_KEY,state);
        }

        publishContext();

        try{
            const fn=compileRuntime(source);
            fn(GM_xmlhttpRequest,GM_getValue,GM_setValue,GM_deleteValue);
        }catch(error){
            console.error('[MM CRM Loader] Active runtime failed',error);
            const previousSource=GM_getValue(PREVIOUS_SOURCE_KEY,'');
            const previousMeta=GM_getValue(PREVIOUS_META_KEY,{})||{};
            if(previousSource&&previousMeta.version){
                try{
                    GM_setValue(CURRENT_SOURCE_KEY,previousSource);
                    GM_setValue(CURRENT_META_KEY,previousMeta);
                    const fn=compileRuntime(previousSource);
                    publishContext();
                    fn(GM_xmlhttpRequest,GM_getValue,GM_setValue,GM_deleteValue);
                    return;
                }catch(previousError){
                    console.error('[MM CRM Loader] Rollback runtime also failed',previousError);
                }
            }
            alert('Torn Bazaar Customer CRM loader could not start the CRM runtime. Open Tampermonkey and reinstall the CRM userscript.');
        }
    }

    await bootstrap();
})();
