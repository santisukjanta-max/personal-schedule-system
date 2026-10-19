const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// เชื่อมต่อ Supabase ผ่านค่าวาไรเอเบิล DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 1. API เข้าสู่ระบบ (Login)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(
            'SELECT user_id, username FROM "Users" WHERE username = $1 AND pass = $2',
            [username, password]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. API ดึงรายการกิจกรรมทั้งหมด
app.get('/api/tasks/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `SELECT t.task_id as id, t.taskname, t.startTime, t.endTime, t.detail, 
                    t.status_id, s.status_name as status 
             FROM "Tasks" t 
             JOIN "Task_Status" s ON t.status_id = s.status_id 
             WHERE t.user_id = $1 
             ORDER BY t.startTime ASC`,
            [userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. API เพิ่มกิจกรรมใหม่
app.post('/api/tasks', async (req, res) => {
    try {
        const { taskname, startTime, endTime, detail, status_id, user_id } = req.body;
        const result = await pool.query(
            `INSERT INTO "Tasks" (taskname, startTime, endTime, detail, status_id, user_id) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING task_id`,
            [taskname, startTime, endTime, detail || '', status_id || 1, user_id]
        );
        res.json({ success: true, taskId: result.rows[0].task_id, message: 'เพิ่มกิจกรรมเรียบร้อยแล้ว' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. API ลบกิจกรรม
app.delete('/api/tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        await pool.query('DELETE FROM "Tasks" WHERE task_id = $1', [taskId]);
        res.json({ success: true, message: 'ลบกิจกรรมเรียบร้อยแล้ว' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. API จัดตารางเวลาอัตโนมัติ
app.post('/api/auto-schedule', async (req, res) => {
    try {
        const { userId, targetDate } = req.body;
        const result = await pool.query(
            `SELECT * FROM "Tasks" WHERE user_id = $1 AND status_id != 3`,
            [userId]
        );

        let baseHour = 9;
        const baseDate = targetDate || new Date().toISOString().split('T')[0];

        for (let task of result.rows) {
            let startStr = `${baseDate} ${String(baseHour).padStart(2, '0')}:00:00`;
            let endHour = baseHour + 1;
            let endStr = `${baseDate} ${String(endHour).padStart(2, '0')}:00:00`;

            await pool.query(
                `UPDATE "Tasks" SET startTime = $1, endTime = $2 WHERE task_id = $3`,
                [startStr, endStr, task.task_id]
            );
            baseHour += 2;
        }

        res.json({ success: true, message: 'จัดตารางเวลาอัตโนมัติสำเร็จแล้ว' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
