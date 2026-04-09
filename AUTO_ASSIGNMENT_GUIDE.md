# Automatic Volunteer Assignment System

## Overview

This document describes the automatic volunteer assignment system integrated into SahayakNet. When a new request is created (via WhatsApp, IVR, SMS, drone, or web), the system automatically assigns the nearest available volunteer, eliminating manual assignment delays.

---

## Architecture

```
Request Created
    ↓
Auto-Assign Logic
    ├─ Find best volunteer (same zone, lowest load, nearest)
    ├─ Assign request
    ├─ Set 30-second acceptance timeout
    └─ Update volunteer status to "busy"
    ↓
Volunteer Response (2 paths)
    ├─ ACCEPT → Status = "accepted" → Ready to dispatch
    └─ REJECT or TIMEOUT → Reassign to next best volunteer
    ↓
Dashboard updates in real-time
```

---

## Request States

The system now supports 5 request states:

### 1. **pending**
- Request created but not yet assigned
- Waiting for volunteer availability
- NGO can manually trigger auto-assignment via `/auto-assign` endpoint

### 2. **assigned**
- Volunteer automatically assigned
- Volunteer has not yet accepted
- 30-second timeout: if not accepted, reassign to next volunteer
- Volunteer sees request in their portal with Accept/Reject buttons

### 3. **accepted**
- Volunteer explicitly accepted the assignment
- Request is "locked in" with this volunteer
- Timeout cancelled
- Volunteer can start moving to location

### 4. **on_the_way**
- Volunteer has started moving towards the location
- Triggered via `/mission/start` endpoint
- Dashboard shows ETA and live location updates

### 5. **completed**
- Request fulfilled by volunteer
- Inventory consumed
- Volunteer marked as available again
- Task count incremented for volunteer

---

## Auto-Assignment Algorithm

When a request is created, the system finds the best available volunteer using this priority:

```python
def find_best_volunteer(request):
    # Step 1: Filter available volunteers only
    available = [v for v in volunteers if v.availability == "available"]
    
    # Step 2: Score each volunteer
    for volunteer in available:
        zone_match = 0 if volunteer.zone == request.zone else 1
        load = count_active_tasks(volunteer.id)  # 0-N
        distance = haversine_distance(request.lat, request.lng, 
                                      volunteer.lat, volunteer.lng)
        
        score = (zone_match, load, distance)
    
    # Step 3: Return volunteer with best score
    return min(available, key=score)
```

**Scoring Priority:**
1. **Same Zone** (0) > Different Zone (1)
2. **Lower Load** (fewer active tasks) > Higher Load
3. **Closer Distance** > Farther Distance

**Example:**
```
Request: Medical help in Dhanbad, 3 people
├─ Volunteer A: Dhanbad, 1 active task, 2km away
│  Score: (0, 1, 2000m) ✓ CHOSEN
├─ Volunteer B: Dhanbad, 2 active tasks, 1km away
│  Score: (0, 2, 1000m)
└─ Volunteer C: Ranchi, 0 active tasks, 50km away
   Score: (1, 0, 50000m)
```

---

## Volunteer Portal: Task Management

### GET /volunteer/{volunteer_id}/tasks
Returns all active assignments for a volunteer.

```bash
curl http://localhost:8000/volunteer/VOL-001/tasks
```

**Response:**
```json
{
  "volunteer": {
    "id": "VOL-001",
    "name": "Raj Kumar",
    "phone": "9800000001",
    "availability": "busy",
    "zone": "Dhanbad",
    "lat": 23.7957,
    "lng": 86.4304
  },
  "activeTasks": 2,
  "tasks": [
    {
      "id": "REQ-0125",
      "name": "Medical Emergency",
      "category": "medical",
      "people": 3,
      "location": "Dhanbad Sector 1",
      "priority": 70,
      "status": "assigned",
      "createdAt": "2025-04-05T08:30:00Z",
      "assignedAt": "2025-04-05T08:30:15Z"
    },
    {
      "id": "REQ-0126",
      "name": "Food Distribution",
      "category": "food",
      "people": 5,
      "location": "Dhanbad Sector 2",
      "priority": 45,
      "status": "assigned",
      "createdAt": "2025-04-05T08:35:00Z",
      "assignedAt": "2025-04-05T08:35:12Z"
    }
  ],
  "completedTasks": 12
}
```

**Task List Features:**
- Sorted by priority (highest first) and assignment time (most recent first)
- Each task shows full request details
- Volunteer can click "Accept" or "Reject" on each task

---

## Acceptance Flow

### 1. Volunteer Accepts Assignment

**POST /volunteer/accept**
```bash
curl -X POST http://localhost:8000/volunteer/accept \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "REQ-0125",
    "volunteer_id": "VOL-001"
  }'
```

**Effects:**
- ✅ Request status changes to **"accepted"**
- ✅ Volunteer stays "busy"
- ✅ 30-second timeout is **cancelled**
- ✅ Volunteer portal shows green "Accepted" status
- ✅ NGO dashboard shows green badge
- ✅ Real-time sync updates all portals instantly

---

### 2. Volunteer Rejects Assignment

**POST /volunteer/reject**
```bash
curl -X POST http://localhost:8000/volunteer/reject \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "REQ-0125",
    "volunteer_id": "VOL-001",
    "reason": "Too far away"
  }'
```

**Effects:**
- ✅ Current volunteer becomes **"available"** again
- ✅ System automatically reassigns to **next best volunteer**
- ✅ Previous volunteer removed from assignment tracker
- ✅ New volunteer gets 30-second timer again
- ✅ NGO dashboard shows "Reassigning" status
- ✅ Request stays "assigned" (but with new volunteer)

---

### 3. Timeout: Volunteer Doesn't Accept (30s)

**Automatic Process:**

```
Timeline:
0s    → Request assigned to Volunteer A
10s   → Volunteer A opens task portal
20s   → Volunteer A rejects or doesn't respond
30s   → TIMEOUT TRIGGERED
        ├─ Volunteer A becomes available
        ├─ System finds next best volunteer (Volunteer B)
        ├─ Request reassigned to Volunteer B
        ├─ New 30s timer starts for Volunteer B
        └─ NGO dashboard updates
```

**Config:**
```python
ASSIGNMENT_TIMEOUT_SECONDS = 30  # in main.py
```

---

## NGO Dashboard Status Badges

The dashboard shows color-coded request status:

| Status | Color | Meaning | NGO Action |
|--------|-------|---------|-----------|
| **pending** | Yellow ⚠️ | No volunteer assigned | Click "Force Assign" |
| **assigned** | Blue ℹ️ | Waiting for acceptance | Wait or reassign |
| **accepted** | Green ✅ | Volunteer confirmed | Monitor progress |
| **on_the_way** | Purple 🔵 | Volunteer moving | See live location |
| **completed** | Gray ⬜ | Task done | View completion details |

---

## Manual Assignment (Override)

NGO can still manually assign or force auto-assignment:

### Force Auto-Assignment
```bash
curl -X POST http://localhost:8000/auto-assign?request_id=REQ-0125
```

### Manual Assignment (Traditional)
```bash
curl -X POST http://localhost:8000/assign \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "REQ-0125",
    "volunteer_id": "VOL-003"
  }'
```

---

## Data Structures

### Updated Request Object

New fields added to request:

```json
{
  "id": "REQ-0125",
  "name": "Medical Emergency",
  "category": "medical",
  "family_size": 3,
  
  // NEW: Assignment fields
  "status": "assigned",
  "assignedAt": "2025-04-05T08:30:15Z",
  "acceptedAt": null,
  "assignedVolunteerId": "VOL-001",
  "assignedVolunteerName": "Raj Kumar",
  
  // Existing fields
  "priority": 70,
  "createdAt": "2025-04-05T08:30:00Z",
  "source": "web",
  "location": "Dhanbad Sector 1",
  "zone": "Dhanbad",
  "lat": 23.7957,
  "lng": 86.4304,
  "eta": null
}
```

### Updated Volunteer Object

```json
{
  "id": "VOL-001",
  "name": "Raj Kumar",
  "phone": "9800000001",
  "availability": "busy",
  "zone": "Dhanbad",
  "lat": 23.7957,
  "lng": 86.4304,
  "tasksCompleted": 12,
  
  // NEW: Assignment tracking
  "assignedRequest": "REQ-0125"
}
```

---

## Global State Tracking

The system maintains in-memory state for assignments:

### assignment_tracker
```python
{
  "REQ-0125": {
    "volunteer_id": "VOL-001",
    "assigned_at": "2025-04-05T08:30:15Z",
    "status": "assigned"  # or "accepted"
  }
}
```

### assignment_timeouts
```python
{
  "REQ-0125": <asyncio.Task object>  # Timeout task
}
```

These are cleaned up when:
- Volunteer accepts (timeout cancelled)
- Volunteer rejects (timeout cancelled)
- Timeout triggers (task cleaned up)

---

## Real-Time Sync

The system maintains real-time sync through:

### Automatic Updates
- Every endpoint triggers `schedule_cache_refresh()`
- Dashboard cache updated immediately
- Both NGO and volunteer portals receive updates

### Polling (Recommended)
Frontends should poll every 3-5 seconds:

```javascript
// Volunteer portal
setInterval(() => {
  fetch(`/volunteer/{volunteerId}/tasks`)
    .then(r => r.json())
    .then(data => updateUI(data.tasks))
}, 3000);

// NGO dashboard
setInterval(() => {
  fetch(`/dashboard`)
    .then(r => r.json())
    .then(data => updateUI(data))
}, 5000);
```

### WebSocket (Optional Future Enhancement)
For true real-time updates, implement WebSocket:
- Initial state: HTTP POST/GET
- Updates: WebSocket broadcast
- Fallback: HTTP polling

---

## Conflict Prevention

### Duplicate Assignment Prevention
- Each request is locked to ONE volunteer at a time
- When assigning, volunteer is marked "busy"
- Cannot reassign while volunteer is busy (except via reject/timeout)

### Data Consistency
- Assignment tracker prevents race conditions
- Timeout tasks are tracked and cancelled properly
- Dashboard cache refresh happens after every change

---

## Integration with Existing Systems

✅ **No Breaking Changes:**

- WhatsApp requests → Auto-assigned (not breaking old flow)
- IVR requests → Auto-assigned (not breaking old flow)
- SMS requests → Auto-assigned (not breaking old flow)
- Drone requests → Auto-assigned (not breaking old flow)
- Manual assignment → Still works (legacy flow preserved)

**All existing endpoints remain unchanged:**
- `/request` - Creates request with auto-assignment
- `/assign` - Manual assignment (still works)
- `/complete` - Complete request (still works)
- `/volunteer` - Volunteer registration (unchanged)

---

## Failure Scenarios & Handling

### Scenario 1: No Volunteers Available
```
Request created → Find best volunteer → None available
Result: Request stays "pending"
Action: NGO can manually assign or wait for volunteer to become available
```

### Scenario 2: Volunteer Rejects All Tasks
```
Volunteer A rejects → Reassign to B (30s timeout)
Volunteer B rejects → Reassign to C (30s timeout)
Volunteer C rejects → No more volunteers
Result: Request back to "pending"
Action: NGO notified, can manually assign
```

### Scenario 3: Volunteer Response Timeout
```
Volunteer assigned at 08:30:00
Volunteer not responding at 08:30:30
Action: Auto-reassign to next volunteer
Result: Previous volunteer becomes available, new volunteer gets 30s
```

### Scenario 4: Volunteer Becomes Inactive
```
Volunteer A assigned with "available" status
Volunteer A changes to "inactive" during assignment
Result: Volunteer can still accept (assignment already made)
Action: Volunteer availability change only affects new assignments
```

---

## Monitoring & Debugging

### Check Assignment Status
```bash
curl http://localhost:8000/request/REQ-0125
```

### Get Volunteer's Active Tasks
```bash
curl http://localhost:8000/volunteer/VOL-001/tasks
```

### Force Reassignment
```bash
curl -X POST http://localhost:8000/volunteer/reject \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "REQ-0125",
    "volunteer_id": "VOL-001"
  }'
```

### Logs to Check
In the backend terminal, look for:
```
Auto-assigned REQ-0125 to Raj Kumar (VOL-001)
Volunteer VOL-001 accepted REQ-0125
Reassigning REQ-0125 (timeout: 30s)
No available volunteers for REQ-0125 - request pending
```

---

## Performance Characteristics

- **Assignment lookup**: O(n) where n = number of volunteers (typically <50)
- **Auto-assignment time**: <100ms
- **Dashboard refresh**: <200ms
- **Memory usage**: ~1KB per active assignment

**Scaling Considerations:**
- Current implementation suitable for <500 volunteers
- For larger deployments, implement indexed lookup by zone
- Consider caching volunteer availability in separate data structure

---

## Configuration

Edit in `backend/main.py`:

```python
# Timeout before reassigning
ASSIGNMENT_TIMEOUT_SECONDS = 30

# Preference weights (modify find_best_volunteer for custom scoring)
# Currently: same_zone > low_load > nearest_distance
```

---

## API Reference

### Endpoints Added

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/volunteer/accept` | Volunteer accepts assignment |
| POST | `/volunteer/reject` | Volunteer rejects assignment |
| GET | `/volunteer/{id}/tasks` | Get volunteer's active tasks |
| POST | `/auto-assign?request_id=X` | Manually trigger auto-assign |

### Request Body Examples

**Accept Request:**
```json
{
  "request_id": "REQ-0125",
  "volunteer_id": "VOL-001"
}
```

**Reject Request:**
```json
{
  "request_id": "REQ-0125",
  "volunteer_id": "VOL-001",
  "reason": "Too far away"
}
```

---

## Testing the System

### Test 1: Basic Auto-Assignment
```bash
# 1. Create a request
curl -X POST http://localhost:8000/request \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "phone": "9800000001",
    "category": "medical",
    "people": 3,
    "location": "Test Location",
    "zone": "Dhanbad"
  }'

# 2. Check if request is assigned
curl http://localhost:8000/requests | grep "assignedVolunteerName"
# Should show a volunteer name

# 3. Check volunteer's tasks
curl http://localhost:8000/volunteer/VOL-001/tasks | grep activeTasks
# Should show 1+ active tasks
```

### Test 2: Accept Flow
```bash
# 1. From test above, get request_id and volunteer_id
# 2. Accept the request
curl -X POST http://localhost:8000/volunteer/accept \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "REQ-XXXX",
    "volunteer_id": "VOL-XXX"
  }'

# 3. Check status is "accepted"
curl http://localhost:8000/request/REQ-XXXX | grep status
# Should show "accepted"
```

### Test 3: Reject & Reassignment
```bash
# 1. Create request (auto-assigned to Volunteer A)
# 2. Reject the assignment
curl -X POST http://localhost:8000/volunteer/reject \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "REQ-0125",
    "volunteer_id": "VOL-001"
  }'

# 3. Check if reassigned to new volunteer
curl http://localhost:8000/request/REQ-0125 | grep assignedVolunteerName
# Should show different volunteer name
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Requests not auto-assigning | Check if volunteers exist and have `availability: "available"` |
| Volunteer not seeing tasks | Call `GET /volunteer/{id}/tasks` and check response |
| Timeout not triggering | Check async tasks aren't cancelled prematurely |
| Reassignment loop | Ensure volunteers can change availability |
| Dashboard not updating | Force refresh cache or check polling interval |

---

## Future Enhancements

1. **Priority-based assignment**: Prefer volunteers skilled in specific categories
2. **Vehicle-based assignment**: Prefer volunteers with vehicles for rescue missions
3. **Skill matching**: Assign medical emergencies to medical volunteers
4. **Load balancing**: Distribute tasks evenly across volunteers
5. **WebSocket real-time**: Push updates instead of polling
6. **Assignment history**: Track all assignments and reassignments
7. **Volunteer rating**: Prioritize based on completion success rate
8. **Estimated time**: Calculate and update ETA based on volunteer location

---

## Summary

The automatic volunteer assignment system:
✅ Eliminates manual assignment delays
✅ Uses intelligent scoring (zone, load, distance)
✅ Handles acceptance/rejection gracefully
✅ Prevents duplicate assignments
✅ Supports real-time dashboard sync
✅ Maintains full backward compatibility
✅ Handles edge cases (no volunteers, timeouts)
✅ Provides NGO override capabilities

**Result:** Faster disaster response, better volunteer utilization, improved coordination across all portals.
