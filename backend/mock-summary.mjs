import { AppError } from './errors.mjs';

// 仅供 Mock 重点提炼使用，不改变上传原文或其他学习任务的输入。
const EMAIL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const URL = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s，。；！？”）]+/gi;
const PAGE = /^(?:[-–—]+\s*)?(?:\d+\s*(?:of|\/)\s*\d+|page\s*\d+(?:\s*of\s*\d+)?|第\s*\d+\s*页(?:\s*[/／]?\s*共\s*\d+\s*页)?)(?:\s*[-–—]+)?$/i;
const DEFINITION = /称为|定义为|表示|是指|称作/;
const CONCLUSION = /因此|因而|可见|说明|得到|满足|可知|等于|对应|等效|固定为|不再含/;
const GENERIC_HEADING = /^(?:目录|小结|总结|结论|思考题|练习|例题|物理模型|引言|正文|内容|简介|概述|解运动方程|一维链例子)$/;
// 这些词只用于匹配原文与排序，不提供任何额外知识或结论。
const TERM_HINTS = [
  '周期性边界条件','第一布里渊区','一维复式晶格','一维简单晶格','晶格振动','简正坐标','简正振动','独立谐振子','简谐振子',
  '双原子链','单原子链','三维晶格','色散关系','声学支','光学支','声学波','光学波','波矢密度','波矢点阵','振动模式','模式数',
  '倒格矢','倒空间','自由度','振幅分量','原胞','原子','波矢','振幅','频率','相位','动能','势能','金刚石',
  '人工智能','机器学习','监督学习','无监督学习','深度学习','大语言模型','提示词','训练集','测试集','泛化能力','过拟合','准确率','正则化',
  '神经网络','概率分布','线性回归','逻辑回归','导数','积分','能量守恒','电磁场','动量','熵','聚类','分类','回归'
];
const countChinese = text => (text.match(/[\u4e00-\u9fff]/g) || []).length;
const canonical = text => text.replace(/[\s，。；、：:,.!！?？·•]/g, '').toLowerCase();
const normalizeLine = text => text.replace(/[Ａ-Ｚａ-ｚ０-９\u{1d400}-\u{1d7ff}]/gu, char=>char.normalize('NFKC')).replace(/[\u0000\u200b-\u200f\ufeff]/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/([\u4e00-\u9fff]) +(?=[\u4e00-\u9fff])/g, '$1').trim();
const stripBullet = text => text.replace(/^[•●▪◦◆◇]\s*/, '').trim();
const stripHeading = text => text.replace(/^#{1,6}\s*/, '').replace(/^(?:第[一二三四五六七八九十\d]+[章节]\s*|\d+(?:\.\d+)*[.、)]?\s+)/, '').trim();

function institutionLine(line) {
  return line.length < 80 && /大学|学院|学校|研究所|实验室|University|College|School of/i.test(line)
    && !/是指|称为|定义|采用|通过|研究如何|利用|用于|例如|可以|能够|模型|学习方法|意味着/.test(line)
    && !/[。！？；]/.test(line);
}
function metadataLine(line) {
  return PAGE.test(line) || /^\d{4}[./年-]\d{1,2}[./月-]\d{1,2}日?$/.test(line)
    || /^(?:主讲|讲师|教师|授课教师|任课教师|作者|报告人|姓名)\s*[:：]?\s*[\u4e00-\u9fff·]{2,12}$/.test(line)
    || /^(?:邮箱|电子邮箱|联系邮箱|email|e-mail|网址|网站|联系方式)\s*[:：]?\s*$/i.test(line)
    || /(?:第\s*\d+\s*章).*\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/.test(line)
    || /^(?:目录|谢谢(?:大家)?|感谢聆听|END|THE END|THANK YOU)$/i.test(line)
    || /^[\d\s\W_]+$/.test(line) && !/[\u4e00-\u9fff]/.test(line);
}
function isHeading(line) {
  const plain = stripHeading(line);
  if (line.length > 65 || countChinese(line) < 2 || /[。！？；!?;=≡,.，]/.test(plain)) return false;
  if (/^#{1,6}\s|^\d+(?:\.\d+)*\s+|^第[一二三四五六七八九十\d]+[章节]/.test(line)) return true;
  if (/\d|[+−]/.test(plain) || /^(?:每|固定|独立|色散关系种类)/.test(plain)) return false;
  return plain.length <= 20 && !/[,，]/.test(plain)
    && (/坐标|振动|关系|条件|晶格|概念|定律|原理|理论|色散支|声学支|光学支|光学波|声学波|双原子链|监督学习|过拟合|训练集|测试集|准确率|机器学习/.test(plain)
      || GENERIC_HEADING.test(plain));
}
function isFormulaLine(line) {
  const chinese = countChinese(line);
  if (!chinese) return true;
  if (/[=≡∑⟹]/.test(line) && !/是指|称为|表示|描述|满足|等于|因而|因此|意味着|得到|给出|对应|反映/.test(line)) return true;
  // 包含少量文字标签的长公式也不是一条解释。
  return chinese < 10 && (/[=≡∑√⟹∈⎧⎨⎩]/.test(line) || /[ωαβξδ𝑎]/u.test(line));
}
function tableOrDiagramLine(line) {
  return /^(?:模型.*自由度|每原胞原子数|独立波矢数\s+[A-Za-z]|色散关系种类|[{}].*模式|总模式数目)/.test(line)
    || /^(?:一维)?(?:单|双)原子链\s+\d/.test(line)
    || /^三维晶格\s+n\s*(?:=|\d)/.test(line)
    || /^N\d\s*个原胞$/.test(line);
}
function joinLines(parts) {
  return parts.join(' ').replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1').replace(/\s+([，。；：！？])/g, '$1').trim();
}

export function cleanSummaryText(raw) {
  const original = raw.replace(/\r\n?/g, '\n').split('\n').map(normalizeLine);
  const pages = [];
  let page = [];
  for (const line of original) {
    if (PAGE.test(line)) { pages.push(page); page = []; }
    else if (line) page.push(line);
  }
  if (page.length) pages.push(page);
  const repeated = new Map();
  // 数字归一后识别重复边缘文本，正文标题单独保留，不当成知识点。
  const edgeKey = line => canonical(line.replace(/\d+/g, '#'));
  for (const lines of pages) {
    const seen = new Set();
    lines.forEach((line, index) => {
      if (!isHeading(line) && (index < 3 || index >= lines.length - 3)) seen.add(edgeKey(line));
    });
    for (const key of seen) repeated.set(key, (repeated.get(key) || 0) + 1);
  }
  const cleaned = [], headings = [], removed = { contact:0, pages:original.filter(line=>PAGE.test(line)).length, metadata:0, repeated:0, fragments:0 };
  let documentTitle = '';
  pages.forEach((lines, pageIndex) => {
    lines.forEach((rawLine, index) => {
      let line = rawLine;
      if (EMAIL.test(line) || URL.test(line)) {
        EMAIL.lastIndex = 0; URL.lastIndex = 0;
        line = normalizeLine(line.replace(EMAIL, '').replace(URL, ''));
        removed.contact++;
      }
      EMAIL.lastIndex = 0; URL.lastIndex = 0;
      const nearOrganization = pageIndex === 0 && index > 0 && line.length <= 5 && /^[\u4e00-\u9fff·]{2,5}$/.test(line)
        && institutionLine(lines[index+1] || '');
      if (!line || metadataLine(line) || institutionLine(line) || nearOrganization) { removed.metadata++; return; }
      if (!isHeading(line) && repeated.get(edgeKey(rawLine)) >= 3 && (index < 3 || index >= lines.length - 3)) { removed.repeated++; return; }
      if (pageIndex === 0 && index < 3 && !documentTitle && /^[\u4e00-\u9fffA-Za-z ]{3,25}$/.test(line) && !institutionLine(line)) {
        documentTitle = line; headings.push(line); cleaned.push({kind:'heading',text:line}); return;
      }
      const body = stripBullet(line);
      if(tableOrDiagramLine(body)) {cleaned.push({kind:'formula',text:body});removed.fragments++;return;}
      if (isHeading(body) && !/^[•●▪◦◆◇]/.test(line)) {
        const title=stripHeading(body); headings.push(title);cleaned.push({kind:'heading',text:title});return;
      }
      if (isFormulaLine(body)) {
        // 公式中的明确标签可以作为后续正文的上下文，不把公式本身输出。
        const label = body.match(/(光学波|声学波|光学支|声学支)\s*$/)?.[1];
        if (label) cleaned.push({kind:'heading',text:label});
        cleaned.push({kind:'formula',text:body});removed.fragments++;return;
      }
      cleaned.push({kind:'body',text:body,bullet:/^[•●▪◦◆◇]/.test(line)});
    });
    cleaned.push({kind:'break',text:''});
  });
  const result={ text:'', lines:cleaned, headings:[...new Set(headings)], documentTitle, removed };
  result.text=[...result.headings,...sentenceRecords(result).map(record=>record.text)].join('\n');
  return result;
}

function sentenceRecords(cleaned) {
  const records = [], seen = new Set();
  let heading='', afterHeading=0, parts=[], formula=false;
  function flush() {
    if (!parts.length) return;
    const paragraph=joinLines(parts);parts=[];
    const pieces=paragraph.match(/[^。！？；!?;]+[。！？；!?;]?/g) || [];
    let pending='', previousInParagraph;
    for (let piece of pieces) {
      if (/[？?]$/.test(piece)) {pending='';continue;}
      piece=piece.replace(/[。！；!;]$/,'').trim();
      if (!piece) continue;
      if (/[:：]$/.test(piece) && piece.length<18) continue;
      // 太短的从句与相邻正文结合，始终保留整个句子，不做字符截断。
      if (pending) {piece=`${pending}，${piece}`;pending='';}
      if (piece.length < 15 || /^(?:与|和|及|且|可被|频率低|即相互|其中)/.test(piece)) {
        const previous=previousInParagraph;
        if (previous && previous.heading===heading && piece.length<65 && previous.text.length+piece.length<190) {
          previous.text=previous.text.replace(/。$/,'')+`；${piece}。`;
          previous.formula ||= formula;
        } else pending=piece;
        continue;
      }
      const key=canonical(piece);
      if (!seen.has(key)) {seen.add(key);previousInParagraph={text:`${piece.replace(/[:：,，]$/,'')}。`,heading,afterHeading:afterHeading++,formula};records.push(previousInParagraph);}
    }
    formula=false;
  }
  for (const line of cleaned.lines) {
    if (line.kind==='heading') {flush();heading=line.text;afterHeading=0;continue;}
    if (line.kind==='break') {flush();continue;}
    if (line.kind==='formula') {flush();formula=true;continue;}
    if (line.bullet) flush();
    parts.push(line.text);
  }
  flush();
  return records;
}

function topicTerms(text, headings) {
  const counts=new Map();
  const terms=new Set(TERM_HINTS.filter(term=>text.includes(term)));
  for(const heading of headings) for(const part of heading.split(/[:：、,，]/)) {
    const term=part.trim();if(term.length>=2 && term.length<=16 && !GENERIC_HEADING.test(term))terms.add(term);
  }
  // 无词典依赖的词频补充，只保留重复的中文片段，过滤明显虚词边界。
  const grams=new Map();
  for(const run of text.match(/[\u4e00-\u9fff]{2,}/g)||[]) for(let length=2;length<=6;length++) for(let i=0;i+length<=run.length;i++) {
    const gram=run.slice(i,i+length);
    if(/^[每个的了在与第共一因其将并由使各总为对本该这可含有是得按从及]|[的和与为是在于及个而则种]$/.test(gram))continue;
    grams.set(gram,(grams.get(gram)||0)+1);
  }
  const dynamic=[...grams].filter(([,count])=>count>=3).sort((a,b)=>b[1]*b[0].length-a[1]*a[0].length||a[0].localeCompare(b[0],'zh-CN')).slice(0,16);
  for(const [term] of dynamic) if(![...terms].some(known=>known.includes(term)))terms.add(term);
  for(const term of terms) counts.set(term,text.split(term).length-1);
  return [...counts].map(([term,frequency])=>({term,frequency})).sort((a,b)=>b.frequency*Math.sqrt(b.term.length)-a.frequency*Math.sqrt(a.term.length)||a.term.localeCompare(b.term,'zh-CN'));
}

function isComplete(record) {
  const sentence=record.text;
  if(sentence.length<15 || sentence.length>220 || countChinese(sentence)<10 || EMAIL.test(sentence) || URL.test(sentence))return false;
  EMAIL.lastIndex=0;URL.lastIndex=0;
  if (PAGE.test(sentence.replace(/。$/,'')) || institutionLine(sentence) || /^(?:与|和|及|可被|等于零|得到平方形式|代回动能|将其代入)/.test(sentence))return false;
  if (/^(?:代回原子|格波解代入|选择适当的变换系数)/.test(sentence) && /[:：]。?$/.test(sentence)) return false;
  if (/(?:[是为有]\s*|[故则]\s*|得到\s*|其中\s*|求得的\s*|得到的\s*)。$/.test(sentence)) return false;
  // PDF 分式、上下标可能跨多行；不把跳过公式后的半条等式当作解释。
  if (/[⎧⎨⎩∑{}=≡]/.test(sentence) || /^(?:因而|得到|即)\s*[:：]?。?$/.test(sentence))return false;
  if (/(?:对含.*的晶体|共有.*原子：|由此可知|利用正则方程|先确定原胞位置|代回原子位移与简正坐标的关系)。$/.test(sentence)) return false;
  return /是|为|有|含|称|定义|表示|描述|对应|满足|等于|等效|决定|反映|说明|得到|变换|化为|具有|不动|振动|运动|形成|传播|取值|限制|回到|可以|用于|使用|学习|预测|影响|识别|发现|降低|增加|需要|不能|固定|保持|输出|研究|区别|选择|占据|耦合/.test(sentence);
}

function titleFor(record, terms, index) {
  const leaf=record.heading.split(/[:：]/).at(-1)?.trim();
  const definition=record.text.match(/(?:称为|称作|定义为)\s*([\u4e00-\u9fff]{2,12})/);
  if(definition) return leaf && /案例|实例|振动谱/.test(leaf) ? `${leaf}中的${definition[1]}` : `${definition[1]}的定义`;
  const definedSubject=record.text.match(/^([\u4e00-\u9fff]{2,16}?)(?:是指|定义为|表示)/)?.[1];
  if(definedSubject)return `${definedSubject}的含义`;
  if(record.text.includes('声学支')&&record.text.includes('光学支'))return `${record.heading.startsWith('三维晶格')?'三维晶格的':''}声学支与光学支`;
  if(record.text.includes('简正坐标')&&record.text.includes('独立谐振子'))return '简正坐标与独立谐振子';
  if(leaf && /[:：]/.test(record.heading) && !GENERIC_HEADING.test(leaf) && leaf.length<=24 && /[\u4e00-\u9fff]/.test(leaf))return leaf;
  const matching=terms.filter(item=>record.text.includes(item.term)&&item.term.length>=3);
  const specific=matching.filter(item=>!matching.some(other=>other.term.length>item.term.length && other.term.includes(item.term)));
  const first=specific.sort((a,b)=>record.text.indexOf(a.term)-record.text.indexOf(b.term)||b.term.length-a.term.length)[0]?.term;
  if(first)return `${first}${DEFINITION.test(record.text)?'的含义':'的基本关系'}`;
  const subject=record.text.match(/^(.{2,16}?)(?:是指|定义为|表示|是|具有|满足|对应|等于)/)?.[1]?.replace(/^(?:因此|因而|可见|可知|其中|另外)[，,]?/,'').trim();
  if(subject && countChinese(subject)>=2 && !/[=≡→]/.test(subject))return subject;
  return `核心知识点 ${index+1}`;
}

export function extractMockSummary(raw, filename='') {
  const cleaned=cleanSummaryText(raw);
  const terms=topicTerms(cleaned.text,cleaned.headings);
  const candidates=sentenceRecords(cleaned).filter(isComplete).map((record,index)=>{
    const frequencyScore=terms.filter(item=>record.text.includes(item.term)).slice(0,8).reduce((sum,item)=>sum+Math.min(4,Math.log2(1+item.frequency))*(item.term.length>=4?1.2:0.6),0);
    const definition=DEFINITION.test(record.text),conclusion=CONCLUSION.test(record.text);
    const score=(definition?8:0)+(conclusion?5:0)+(record.heading && record.afterHeading<3?4:0)+(record.formula?2:0)+(record.text.length<=100?4:2)+frequencyScore;
    return {...record,index,score,definition,conclusion,name:titleFor(record,terms,index)};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  const selected=[], perHeading=new Map(), names=new Set();
  for(const candidate of candidates) {
    if(names.has(candidate.name))continue;
    if(/[:：]/.test(candidate.heading)&&(perHeading.get(candidate.heading)||0)>=2)continue;
    const normalized=canonical(candidate.text);
    if(selected.some(item=>canonical(item.text)===normalized))continue;
    selected.push(candidate);names.add(candidate.name);perHeading.set(candidate.heading,(perHeading.get(candidate.heading)||0)+1);
    if(selected.length===10)break;
  }
  if(!selected.length) throw new AppError('SUMMARY_INSUFFICIENT_CONTENT','清洗后没有足够完整的正文可提炼重点，请补充包含概念解释或结论的资料。');
  const concepts=selected.map((item,index)=>({name:/^核心知识点 \d+$/.test(item.name)?`核心知识点 ${index+1}`:item.name,explanation:contextualize(item),importance:item.definition || index<Math.ceil(selected.length*0.3)?3:index<Math.ceil(selected.length*0.7)?2:1}));
  const sections=[...new Set(cleaned.headings.filter(heading=>heading.includes(':')||heading.includes('：')).map(heading=>heading.split(/[:：]/)[0]).filter(heading=>heading!==cleaned.documentTitle&&!GENERIC_HEADING.test(heading)))].slice(0,3);
  const reliableTerms=terms.filter(item=>item.term.length>=3&&TERM_HINTS.includes(item.term)&&!sections.some(title=>title.includes(item.term))).slice(0,4).map(item=>item.term);
  const title=cleaned.documentTitle || (/^[\u4e00-\u9fffA-Za-z ]{3,25}$/.test(filename.replace(/\.[^.]+$/,''))?filename.replace(/\.[^.]+$/,''):'');
  const main=sections.length?`${title?`${title}中的`:''}${sections.join('、')}`:reliableTerms.slice(0,3).join('、');
  const overview=(main?`本资料主要讨论${main}${reliableTerms.length?`，内容涉及${reliableTerms.join('、')}`:''}。`:'本资料主要包含以下核心概念和重要结论，建议结合原始资料逐项复习。')+'演示模式根据资料内容使用本地规则生成学习结果，不调用在线 AI 服务。';
  return {overview,concepts,mustKnow:concepts.filter(concept=>concept.importance===3).slice(0,4).map(concept=>`${concept.name}：${concept.explanation}`),skim:['未列入重点的内容仍需结合原文复习；本地评分只表示文本特征，不代表教师划定的考试范围。']};
}

function contextualize(record) {
  // 从原文标题补足主题标签，不添加资料外的推导或结论。
  if(/^(?:q|ω|在\s*q|在\s*ω)/i.test(record.text) && /^(?:光学波|声学波|光学支|声学支)$/.test(record.heading))return `${record.heading}：${record.text}`;
  if(/^另外/.test(record.text)&&record.heading.startsWith('三维晶格'))return `三维晶格中，${record.text}`;
  if(/^声学支数/.test(record.text)&&record.heading.startsWith('三维晶格'))return `三维晶格中，${record.text}`;
  const leaf=record.heading.split(/[:：]/).at(-1)?.trim();
  if(leaf && /案例|实例|振动谱/.test(leaf) && !record.text.startsWith(leaf))return `${leaf}中，${record.text}`;
  return record.text;
}
