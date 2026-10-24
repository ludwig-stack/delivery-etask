import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isUserTimezone,userTimezone,userDateTime,userTimestamp} from '../lib/timezones.ts';
test('old and unset profiles default to PST and only the three supported zones are accepted',()=>{
  for(const value of [undefined,null,'','UTC','America/Los_Angeles']){assert.equal(userTimezone(value),'PST');assert(!isUserTimezone(value));}
  for(const value of ['PST','PDT','PHT'])assert(isUserTimezone(value));
});
test('PST and PDT have distinct fixed offsets in winter and summer',()=>{
  for(const date of ['2026-01-24T08:05:09Z','2026-07-24T08:05:09Z']){
    assert.equal(userDateTime(date,'PST').time,'12:05:09 AM');
    assert.equal(userDateTime(date,'PDT').time,'01:05:09 AM');
    assert.equal(userDateTime(date,'PHT').time,'04:05:09 PM');
  }
});
test('the live date crosses midnight correctly and timestamps include AM/PM and the selected zone',()=>{
  const date='2026-10-24T07:30:00Z';
  assert.deepEqual(userDateTime(date,'PST'),{date:'Oct 23, 2026',time:'11:30:00 PM'});
  assert.deepEqual(userDateTime(date,'PDT'),{date:'Oct 24, 2026',time:'12:30:00 AM'});
  assert.equal(userTimestamp(date,'PHT'),'Oct 24, 2026 · 03:30:00 PM PHT');
});
