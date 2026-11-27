import type React from 'react';

export function Field({label,children}:{label:string;children:React.ReactNode}){
 return <label className="field"><span>{label}</span>{children}</label>;
}

/* G49: panel dipnottan gecilmiyordu — her ayarin altinda iki paragraf vardi
 * ve panel okunamayacak kadar uzuyordu. Aciklama silinmedi, KATLANDI: bir
 * satirlik ozet gorunur, ayrinti isteyene acilir. */
export function Hint({children,summary='Nasıl çalışır?'}:{children:React.ReactNode;summary?:string}){
 return <details className="hint"><summary>{summary}</summary><div>{children}</div></details>;
}
