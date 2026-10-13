import { buildPrompt } from './prompts/index.mjs';
import { validateOutput } from './schemas.mjs';
import { selectContext } from './retrieval.mjs';
import { mockOutput } from './mock.mjs';
import { AppError } from './errors.mjs';
export function createProvider(config = {}) {
  const key=config.key?.trim();
  const model=config.model?.trim();
  const forced=config.mode || 'auto';
  if(!['auto','mock','live'].includes(forced)) throw new Error('AI_MODE 必须为 auto、mock 或 live');
  const mode=forced==='mock' || (forced==='auto'&&!key)?'mock':'live';
  if(mode==='live' && (!key || !model)) throw new Error('真实 AI 模式需要配置 OPENAI_API_KEY 和 OPENAI_MODEL');
  const baseUrl=(config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/,'');
  if(mode==='live' && !/^https?:\/\//.test(baseUrl)) throw new Error('OPENAI_BASE_URL 必须是 HTTP(S) 地址');
  return {
    mode, model:mode==='mock'?'本地资料演示':model,
    async generate(task,material,params={}) {
      const query=task==='review'?params.result.details.filter(d=>!d.correct).map(d=>d.knowledge).join(' '):params.question;
      const chunks=selectContext(material.chunks,task,query);
      let output;
      if(mode==='mock') output=mockOutput(task,material,chunks,params);
      else {
        const messages=buildPrompt(task,chunks,params);
        const payload={model,messages,temperature:task==='quiz'?0.4:0.2,...(config.jsonMode===false?{}:{response_format:{type:'json_object'}})};
        let response;
        try {
          response=await fetch(`${baseUrl}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(config.timeout || 45000)});
        } catch(error) { throw new AppError('AI_UNAVAILABLE',error.name==='TimeoutError'?'AI 请求超时，请稍后重试或检查模型服务。':'无法连接模型服务，请检查地址和网络。',502); }
        if(!response.ok) {
          // 不向用户回显上游响应，防止凭据和服务细节泄露。
          const message=response.status===401 || response.status===403?'模型服务拒绝访问，请检查 API Key 和模型权限。':response.status===429?'模型请求过于频繁或额度不足，请稍后再试。':'模型服务返回错误，请检查模型名称与兼容协议配置。';
          throw new AppError('AI_HTTP_ERROR',message,502);
        }
        try {
          const json=await response.json();
          const content=json.choices?.[0]?.message?.content;
          if(typeof content!=='string' || content.length>100000) throw new Error();
          output=JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
        } catch { throw new AppError('AI_INVALID_JSON','模型没有返回有效 JSON，请重新生成；可检查该服务是否支持 JSON 模式。',502); }
      }
      let data;
      try { data=validateOutput(task,output,params.count,{mode}); }
      catch { throw new AppError('AI_SCHEMA_ERROR','生成内容未通过格式校验，请重新生成。后端已阻止无效内容进入页面。',502); }
      if(task==='qa') {
        const allowed=new Set(chunks.map(c=>c.id));
        if(data.sourceIds.some(id=>!allowed.has(id)) || (data.grounded && !data.sourceIds.length)) throw new AppError('AI_SOURCE_ERROR','回答的资料引用无效，请重新提问。',502);
        if(!chunks.length) {data.grounded=false;data.sourceIds=[];}
        const notice='当前资料中没有足够信息，以下内容为 AI 补充解释。';
        if(!data.grounded && !data.answer.startsWith(notice)) data.answer=`${notice}\n\n${data.answer}`;
      }
      return { data, mode, sources:task==='qa'?chunks.filter(c=>data.sourceIds.includes(c.id)).map(({id,text,start})=>({id,text,start})):[], contextSampled:!['qa','review'].includes(task)&&material.chunks.length>24 };
    }
  };
}
