from __future__ import annotations
import csv, json
from datetime import datetime
from pathlib import Path
from typing import Any
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.models import BookingRequest, Cancellation, Course, Dataset, Examination, Faculty, Room, RoomUnavailability, StudentGroup, TimetableSession
from app.models.entities import session_groups

class DatasetImportError(ValueError): pass

COLLECTIONS = {
 "faculty": (Faculty, ("name","department","max_hours_per_day","needs_accessible","unavailable","preferences")),
 "courses": (Course, ("title","department","year","lecture_hours","tutorial_hours","lab_blocks")),
 "student_groups": (StudentGroup, ("name","year","department","size","needs_accessible")),
 "rooms": (Room, ("name","building","type","capacity","features","accessible","allowed_uses")),
 "booking_requests": (BookingRequest, ("submitted_at","requester","role","department","requested_category","title","attendance","duration_periods","windows","room_types","needs","requested_room","mandatory_for_groups","series_id","raw_text")),
 "exams": (Examination, ("course_ids","groups","size","duration_hours")),
}
CSV_MAP={"faculty":"faculty.csv","courses":"courses.csv","student_groups":"student_groups.csv","rooms":"rooms.csv","room_unavailability":"room_unavailability.csv","sessions":"sessions.csv","booking_requests":"booking_requests.csv","cancellations":"cancellations.csv","exams":"exams.csv"}
def _cell(v):
 if v is None or not v.strip(): return None
 s=v.strip()
 try:
  if s[0] in '[{"' or s in ('true','false','null'): return json.loads(s)
 except json.JSONDecodeError: pass
 if s.isdigit(): return int(s)
 return s
def _csv(path):
 with path.open(encoding='utf-8-sig',newline='') as f: return [{k:_cell(v) for k,v in r.items()} for r in csv.DictReader(f)]
def load_dataset(source: str|Path)->dict[str,Any]:
 p=Path(source).expanduser().resolve()
 if p.is_dir():
  found=[]
  for f in p.glob('*.json'):
   try: d=json.loads(f.read_text(encoding='utf8'))
   except (OSError,json.JSONDecodeError): continue
   if isinstance(d,dict) and {'dataset_id','institute','calendar'}<=d.keys(): found.append((f,d))
  if len(found)!=1: raise DatasetImportError(f'Expected exactly one dataset JSON in {p}; found {len(found)}')
  p,d=found[0]
 elif p.is_file() and p.suffix.lower()=='.json':
  try: d=json.loads(p.read_text(encoding='utf8'))
  except (OSError,json.JSONDecodeError) as e: raise DatasetImportError(f'Invalid dataset JSON {p}: {e}') from e
 else: raise DatasetImportError('Source must be a dataset JSON file or directory')
 if not isinstance(d,dict): raise DatasetImportError('Dataset root must be a JSON object')
 csvdir=p.parent/'csv'
 for key,file in CSV_MAP.items():
  if key not in d:
   candidate=csvdir/file
   if candidate.exists(): d[key]=_csv(candidate)
   else: d[key]=[]
 return d

def validate(data):
 for f in ('dataset_id','institute','calendar','priority_order','role_category_cap'):
  if f not in data or data[f] is None: raise DatasetImportError(f'Missing required dataset field {f}')
 if not isinstance(data['dataset_id'],str) or not data['dataset_id'].strip(): raise DatasetImportError('dataset_id must be a non-empty string')
 for key,(model,fields) in COLLECTIONS.items():
  rows=data.get(key,[])
  if not isinstance(rows,list): raise DatasetImportError(f'{key} must be a list')
  seen=set()
  for i,r in enumerate(rows):
   if not isinstance(r,dict) or not isinstance(r.get('id'),str) or not r['id'].strip(): raise DatasetImportError(f'{key}[{i}].id is required')
   if r['id'] in seen: raise DatasetImportError(f'{key}[{i}] duplicates source ID {r["id"]!r}')
   seen.add(r['id'])
   missing=[x for x in fields if x not in r]
   if missing: raise DatasetImportError(f'{key}[{i}] missing {missing}')
 for key,required in [('sessions',('id','course_id','faculty_id','kind','groups','size','duration','room_types','needs_accessible')),('room_unavailability',('room_id','day','periods','reason')),('cancellations',('request_id','cancelled_at','by','note'))]:
  for i,r in enumerate(data.get(key,[])):
   missing=[f for f in required if f not in r]
   if missing: raise DatasetImportError(f'{key}[{i}] missing {missing}')
 courses={r['id'] for r in data.get('courses',[])}; faculty={r['id'] for r in data.get('faculty',[])}; groups={r['id'] for r in data.get('student_groups',[])}; rooms={r['id'] for r in data.get('rooms',[])}
 for r in data.get('sessions',[]):
  if r['course_id'] not in courses or r['faculty_id'] not in faculty or any(g not in groups for g in r['groups']): raise DatasetImportError(f'Session {r["id"]!r} references missing course, faculty or group')
 for r in data.get('room_unavailability',[]):
  if r['room_id'] not in rooms: raise DatasetImportError(f'Unavailability references missing room {r["room_id"]!r}')
 requests={r['id'] for r in data.get('booking_requests',[])}
 for i,r in enumerate(data.get('cancellations',[])):
  if r['request_id'] not in requests: raise DatasetImportError(f'cancellations[{i}] references missing booking request {r["request_id"]!r}')
 for key,field in [('booking_requests','submitted_at'),('cancellations','cancelled_at')]:
  for i,row in enumerate(data.get(key,[])):
   try: datetime.fromisoformat(row[field])
   except (TypeError,ValueError) as exc: raise DatasetImportError(f'{key}[{i}].{field} must be an ISO-8601 datetime') from exc

def _upsert(db,model,did,sid,values):
 obj=db.scalar(select(model).where(model.dataset_id==did,model.source_id==sid))
 if obj is None: db.add(model(dataset_id=did,source_id=sid,**values))
 else:
  for k,v in values.items(): setattr(obj,k,v)

def import_dataset(db:Session,source:str|Path):
 data=load_dataset(source); validate(data)
 counts={"faculty":0,"courses":0,"student_groups":0,"rooms":0,"room_unavailability":0,"timetable_sessions":0,"session_groups":0,"booking_requests":0,"cancellations":0,"examinations":0}
 with db.begin():
  ds=db.scalar(select(Dataset).where(Dataset.source_dataset_id==data['dataset_id']).with_for_update())
  if ds is None:
   ds=Dataset(source_dataset_id=data['dataset_id'],institute=data['institute'],calendar=data['calendar'],priority_order=data['priority_order'],role_category_cap=data['role_category_cap']); db.add(ds); db.flush()
  else:
   ds.institute=data['institute']; ds.calendar=data['calendar']; ds.priority_order=data['priority_order']; ds.role_category_cap=data['role_category_cap']
  did=ds.id
  for key,(model,fields) in COLLECTIONS.items():
   for row in data.get(key,[]):
    vals={f:row[f] for f in fields if f!='groups'}
    if key=='exams': vals['group_ids']=row['groups']
    if key=='booking_requests': vals['submitted_at']=datetime.fromisoformat(row['submitted_at'])
    _upsert(db,model,did,row['id'],vals); counts['examinations' if key=='exams' else key]+=1
  db.flush()
  db.execute(delete(RoomUnavailability).where(RoomUnavailability.dataset_id==did))
  for r in data.get('room_unavailability',[]): db.add(RoomUnavailability(dataset_id=did,room_source_id=r['room_id'],day=r['day'],periods=r['periods'],reason=r['reason'])); counts['room_unavailability']+=1
  db.flush()
  for r in data.get('sessions',[]):
   vals={'course_source_id':r['course_id'],'faculty_source_id':r['faculty_id'],'kind':r['kind'],'size':r['size'],'duration':r['duration'],'room_types':r['room_types'],'needs_accessible':r['needs_accessible'],'basket_slot':r.get('basket_slot'),'fixed_slot':r.get('fixed_slot')}
   _upsert(db,TimetableSession,did,r['id'],vals); db.flush()
   db.execute(delete(session_groups).where(session_groups.c.dataset_id==did,session_groups.c.session_source_id==r['id']))
   for gid in r['groups']: db.execute(session_groups.insert().values(dataset_id=did,session_source_id=r['id'],group_source_id=gid)); counts['session_groups']+=1
   counts['timetable_sessions']+=1
  db.flush()
  for r in data.get('cancellations',[]):
   obj=db.scalar(select(Cancellation).where(Cancellation.dataset_id==did,Cancellation.request_source_id==r['request_id']))
   vals={'cancelled_at':datetime.fromisoformat(r['cancelled_at']),'by':r['by'],'note':r['note']}
   if obj is None: db.add(Cancellation(dataset_id=did,request_source_id=r['request_id'],**vals))
   else:
    for k,v in vals.items(): setattr(obj,k,v)
   counts['cancellations']+=1
  db.flush()
 return {'dataset_id':str(did),'source_dataset_id':data['dataset_id'],'counts':counts}
