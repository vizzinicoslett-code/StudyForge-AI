export type Mode = 'mock' | 'live';
export interface Material { id:string;name:string;text:string;type:'md'|'txt'|'pdf';size:number;characters:number }
export interface Summary {overview:string;concepts:{name:string;explanation:string;importance:number}[];mustKnow:string[];skim:string[]}
export interface Outline {sections:{title:string;items:{title:string;type:'理解'|'记忆'|'计算'|'易错';detail:string}[]}[]}
export interface Source {id:string;text:string;start:number}
export interface QA {answer:string;grounded:boolean;sourceIds:string[]}
export interface Envelope<T> {data:T;mode:Mode;sources:Source[];contextSampled:boolean}
export interface Question {id:string;type:'single'|'boolean';question:string;options:string[];knowledge:string}
export interface Quiz {quizId:string;questions:Question[]}
export interface Result {quizId:string;score:number;total:number;correctCount:number;wrongCount:number;mode:Mode;details:(Question & {answer:string;selected:string;explanation:string;correct:boolean})[]}
export interface Review {overview:string;weaknesses:string[];steps:{title:string;action:string}[]}
export interface Chat {question:string;response:Envelope<QA>}
export interface Recent {material:Material;summary?:Envelope<Summary>;outline?:Envelope<Outline>;chats:Chat[];score?:number;updatedAt:string}
