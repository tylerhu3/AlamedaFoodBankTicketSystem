const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors'); // Import the cors package

const app = express();
app.use(cors());
const port = 3000;

app.use(bodyParser.json());

// Create a new database or connect to an existing one
const db = new sqlite3.Database('tickets.db', (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('Connected to the tickets database.');
  
      // Create the tickets table if it doesn't exist
      db.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        scheduleAppointment BOOLEAN NOT NULL,
        firstTimeVisitor BOOLEAN NOT NULL,
        time TIMESTAMP NOT NULL,
        positionInLine INTEGER NOT NULL,
        additionalNotes TEXT,
        done BOOLEAN NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error('Error creating table:', err.message);
      } else {
        console.log('Table "tickets" created successfully.');
      }
    });
    }
  });
  
  
// POST endpoint to create a new ticket
app.post('/tickets', (req, res) => {
    console.log("TYLER: ",  req.body)
    const { firstName, lastName, scheduleAppointment, firstTimeVisitor, positionInLine, additionalNotes, done } = req.body;
    const currentTime = new Date().toISOString().slice(0, 16);
  
    const insertQuery = 'INSERT INTO tickets (firstName, lastName, scheduleAppointment, firstTimeVisitor, time, positionInLine, additionalNotes, done) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    db.run(insertQuery, [firstName, lastName, scheduleAppointment, firstTimeVisitor, currentTime, positionInLine, additionalNotes, done], function (err) {
      if (err) {
        console.error('Error creating ticket:', err.message);
        res.status(500).json({ error: 'Error creating the ticket.' });
      } else {
        const newTicketId = this.lastID;
        res.status(201).json({ id: newTicketId, ...req.body, time: currentTime });
      }
    });
  });
  
  
  // GET endpoint to retrieve all tickets
  app.get('/tickets', (req, res) => {
    db.all('SELECT * FROM tickets', (err, rows) => {
      if (err) {
        console.error('Error fetching tickets:', err.message);
        res.status(500).json({ error: 'Error fetching tickets from the database.' });
      } else {
        res.status(200).json(rows);
      }
    });
  });
  
  // GET endpoint to retrieve a single ticket by ID
  app.get('/tickets/:id', (req, res) => {
    const ticketId = req.params.id;
    db.get('SELECT * FROM tickets WHERE id = ?', ticketId, (err, row) => {
      if (err) {
        console.error('Error fetching ticket:', err.message);
        res.status(500).json({ error: 'Error fetching the ticket from the database.' });
      } else if (!row) {
        res.status(404).json({ error: 'Ticket not found.' });
      } else {
        res.status(200).json(row);
      }
    });
  });
  
  // PUT endpoint to update a ticket by ID
// PUT endpoint to update a ticket by ID
app.put('/tickets/:id', (req, res) => {
    const ticketId = req.params.id;
    const { firstName, lastName, scheduleAppointment, firstTimeVisitor, positionInLine, additionalNotes, done } = req.body;
    const updateQuery = 'UPDATE tickets SET firstName = ?, lastName = ?, scheduleAppointment = ?, firstTimeVisitor = ?, positionInLine = ?, additionalNotes = ?, done = ? WHERE id = ?';
    db.run(updateQuery, [firstName, lastName, scheduleAppointment, firstTimeVisitor, positionInLine, additionalNotes, done, ticketId], function (err) {
      if (err) {
        console.error('Error updating ticket:', err.message);
        res.status(500).json({ error: 'Error updating the ticket.' });
      } else if (this.changes === 0) {
        res.status(404).json({ error: 'Ticket not found.' });
      } else {
        res.status(200).json({ message: 'Ticket updated successfully.' });
      }
    });
  });
  
  
  // DELETE endpoint to delete a ticket by ID
  app.delete('/tickets/:id', (req, res) => {
    const ticketId = req.params.id;
    db.run('DELETE FROM tickets WHERE id = ?', ticketId, function (err) {
      if (err) {
        console.error('Error deleting ticket:', err.message);
        res.status(500).json({ error: 'Error deleting the ticket.' });
      } else if (this.changes === 0) {
        res.status(404).json({ error: 'Ticket not found.' });
      } else {
        res.status(200).json({ message: 'Ticket deleted successfully.' });
      }
    });
  });
  

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});