// Stays occupy nights in [arrival, departure); checkout day remains free.
export function addDays(day,count){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10)}
export function isOccupied(day,ranges){return ranges.some(range=>range.arrival<=day&&range.departure>day)}
export function canArrive(day,ranges,today){return day>=today&&!isOccupied(day,ranges)}
export function canDepart(day,arrival,ranges){return Boolean(arrival&&day>arrival&&day<=addDays(arrival,45)&&!ranges.some(range=>range.arrival<day&&range.departure>arrival))}
