import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,isOccupied,canArrive,canDepart} from '../assets/js/availability-rules.mjs';
const ranges=[{arrival:'2027-01-09',departure:'2027-01-11'},{arrival:'2027-01-20',departure:'2027-01-22'}];
test('confirmed nights are disabled and departure day is available for a new arrival',()=>{
 assert.equal(isOccupied('2027-01-09',ranges),true);
 assert.equal(canArrive('2027-01-10',ranges,'2026-11-27'),false);
 assert.equal(canArrive('2027-01-11',ranges,'2026-11-27'),true);
 assert.equal(canArrive('2026-11-26',ranges,'2026-11-27'),false);
});
test('checkout may equal another arrival but cannot cross occupied nights',()=>{
 assert.equal(canDepart('2027-01-09','2027-01-08',ranges),true);
 assert.equal(canDepart('2027-01-10','2027-01-08',ranges),false);
 assert.equal(canDepart('2027-01-11','2027-01-08',ranges),false);
 assert.equal(canDepart('2027-01-20','2027-01-11',ranges),true);
 assert.equal(canDepart('2027-01-21','2027-01-11',ranges),false);
});
test('dates stay consistent across months and daylight-saving transitions',()=>{
 assert.equal(addDays('2027-01-31',1),'2027-02-01');
 assert.equal(addDays('2028-02-28',1),'2028-02-29');
 assert.equal(addDays('2027-03-13',2),'2027-03-15');
 assert.equal(canDepart('2027-01-11','2027-01-11',[]),false);
 assert.equal(canDepart('2027-02-25','2027-01-11',[]),true);
 assert.equal(canDepart('2027-02-26','2027-01-11',[]),false);
});
