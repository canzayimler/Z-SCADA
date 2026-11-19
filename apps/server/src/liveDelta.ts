import type {Sample} from '../../../packages/contracts/model';
/* Canli yayin deltasi (2026-09-25 inceleme #13): degisince TUM etiketler TUM istemcilere
 * gidiyordu. proto=2 istemciler yalniz degisen ornekleri alir; eski sekmeler tam goruntu
 * almaya devam eder (acik kalmis eski sayfa delta anlamaz, cokerdi). Saf; test edilir. */
export type SampleDelta={changed:Record<string,Sample>;removed:string[];next:Map<string,string>};
export function sampleDelta(prev:Map<string,string>,samples:Record<string,Sample>):SampleDelta{
 const changed:Record<string,Sample>={},next=new Map<string,string>();
 for(const [id,s] of Object.entries(samples)){const j=JSON.stringify(s);next.set(id,j);if(prev.get(id)!==j)changed[id]=s;}
 const removed=[...prev.keys()].filter(id=>!next.has(id));
 return {changed,removed,next};
}
