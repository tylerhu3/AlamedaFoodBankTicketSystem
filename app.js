const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors'); // Import the cors package
const { EventEmitter } = require('events');

const app = express();
// Allow CORS from all devices
app.use(cors({
  origin: '*',
  // You can also specify other CORS options here
}));

const port = 8888;
const eventEmitter = new EventEmitter();


// serve up production assets
app.use(express.static('build'));

// let the react app to handle any unknown routes 
// serve up the index.html if express does'nt recognize the route
const path = require('path');

app.use(bodyParser.json());

// Create a new database or connect to an existing one
const db = new sqlite3.Database('tickets.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the tickets database.');

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
        done BOOLEAN NOT NULL,
        scheduleAppointmentTime TIMESTAMP
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

app.get('/tickets/not-done-from-last-12-hours', (req, res) => {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const query = `
    SELECT * FROM tickets 
    WHERE time >= ? AND done = 0
  `;

  db.all(query, [twelveHoursAgo], (err, rows) => {
    if (err) {
      console.error('Error fetching recent undone tickets:', err.message);
      res.status(500).json({ error: 'Error fetching the recent undone tickets from the database.' });
    } else if (rows.length === 0) {
      res.status(404).json({ error: 'No recent undone tickets found.' });
    } else {
      res.status(200).json(rows);
    }
  });
});

// Define the route for your endpoint
app.get('/tickets/schedule', (req, res) => {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const query = `
    SELECT * FROM tickets 
    WHERE time >= ? AND done = 0 
    AND (scheduleAppointmentTime IS NULL OR scheduleAppointmentTime <= ?)
    ORDER BY 
      CASE
        WHEN scheduleAppointmentTime IS NOT NULL AND scheduleAppointmentTime <= ? THEN scheduleAppointmentTime
        ELSE time
      END DESC,
      positionInLine ASC 
    LIMIT 1
  `;

  db.get(query, [twelveHoursAgo, thirtyMinutesAgo, new Date()], (err, row) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.json(row);
    }
  });
});

// GET endpoint to retrieve the ticket with the biggest "positionInLine" where "done" is false from the last 12 hours
app.get('/tickets/latest', (req, res) => {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const query = 'SELECT * FROM tickets WHERE time >= ? ORDER BY positionInLine DESC LIMIT 1';
  db.get(query, [twelveHoursAgo], (err, row) => {
    if (err) {
      console.error('Error fetching latest ticket:', err.message);
      res.status(500).json({ error: 'Error fetching the latest ticket from the database.' });
    } else if (!row) {
      res.status(404).json({ error: 'Latest ticket not found.' });
    } else {
      res.status(200).json(row);
    }
  });
});

app.get('/tickets/nextInLine', (req, res) => {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  let dateNow = new Date(Date.now()).toISOString();
  console.log("Retrieving closest appointment or smallest position in line, Date.now(): ", dateNow);

  const query = `
    SELECT * 
    FROM tickets
    WHERE time >= ? AND done = 0
    ORDER BY 
      CASE
        WHEN scheduleAppointmentTime IS NOT NULL AND scheduleAppointmentTime >= DATETIME(?, '-30 minutes') THEN ABS(JULIANDAY('now') - JULIANDAY(scheduleAppointmentTime))
        ELSE 9999
      END ASC,
      positionInLine ASC 
    LIMIT 1;
  `;

  db.get(query, [twelveHoursAgo, new Date().toISOString()], (err, row) => {
    if (err) {
      console.error('Error fetching closest appointment:', err.message);
      res.status(500).json({ error: 'Error fetching the closest appointment or the customer with the smallest position in line from the database.' });
    } else if (!row) {
      res.status(404).json({ error: 'Customer not found.' });
    } else {
      console.log("Retrieved:", row);
      res.status(200).json(row);
    }
  });
});

// Define an asynchronous function to get the biggest positionInLine
async function getMaxPositionInLineAsync() {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT MAX(positionInLine) AS maxPosition
      FROM tickets;
    `;

    db.get(query, (err, row) => {
      if (err) {
        console.error('Error fetching max positionInLine:', err.message);
        reject(err);
      } else {
        const maxPosition = row ? row.maxPosition : 0;
        resolve(maxPosition);
      }
    });
  });
}

// POST endpoint to create a new ticket
app.post('/tickets', async (req, res) => {
  console.log("TYLER post request ", req.body);
  const sessionId = req.headers['x-session-id']; // Access the custom header

  const { firstName, lastName, scheduleAppointment, firstTimeVisitor, additionalNotes, done, scheduleAppointmentTime } = req.body;
  const currentTime = new Date().toISOString().slice(0, 16);

  try {
    const maxPositionInLine = await getMaxPositionInLineAsync();
    const positionInLine = maxPositionInLine + 1;

    const insertQuery = 'INSERT INTO tickets (firstName, lastName, scheduleAppointment, firstTimeVisitor, time, positionInLine, additionalNotes, done, scheduleAppointmentTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.run(insertQuery, [firstName, lastName, scheduleAppointment, firstTimeVisitor, currentTime, positionInLine, additionalNotes, done, scheduleAppointmentTime], function (err) {
      if (err) {
        console.error('Error creating ticket:', err.message);
        res.status(500).json({ error: 'Error creating the ticket.' });
      } else {
        const newTicketId = this.lastID;
        res.status(201).json({ id: newTicketId, ...req.body, time: currentTime });
        const updateData = { ...req.body, sessionId: sessionId }; // Include the session ID in the update data
        eventEmitter.emit('ticketUpdated', JSON.stringify(updateData));
      }
    });
  } catch (err) {
    console.error('Error getting max positionInLine:', err);
    res.status(500).json({ error: 'Error creating the ticket.' });
  }
});

// GET endpoint to retrieve all tickets
app.get('/tickets', (req, res) => {
  db.all('SELECT * FROM tickets', (err, rows) => {
    if (err) {
      console.error('Error fetching tickets:', err.message);
      res.status(500).json({ error: 'Error fetching tickets from the database.' });
    } else {
      console.log("all of the table: ", rows)
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
app.put('/tickets/:id', (req, res) => {
  const ticketId = req.params.id;
  const sessionId = req.headers['x-session-id']; // Access the custom header
  const { firstName, lastName, scheduleAppointment, firstTimeVisitor, positionInLine, additionalNotes, done, scheduleAppointmentTime } = req.body;
  const updateQuery = 'UPDATE tickets SET firstName = ?, lastName = ?, scheduleAppointment = ?, firstTimeVisitor = ?, positionInLine = ?, additionalNotes = ?, done = ?, scheduleAppointmentTime = ? WHERE id = ?';
  db.run(updateQuery, [firstName, lastName, scheduleAppointment, firstTimeVisitor, positionInLine, additionalNotes, done, scheduleAppointmentTime, ticketId], function (err) {
    if (err) {
      console.error('Error updating ticket:', err.message);
      res.status(500).json({ error: 'Error updating the ticket.' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Ticket not found.' });
    } else {
      const updateData = { ...req.body, sessionId: sessionId }; // Include the session ID in the update data
      eventEmitter.emit('ticketUpdated', JSON.stringify(updateData));
      console.log("ticket updated")
      res.status(200).json({ message: 'Ticket updated successfully.' });
    }
  });
});

app.get('/sse/tickets', (req, res) => {
  console.log("/sse/tickets Called");
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send the initial data to the client
  db.all('SELECT * FROM tickets', (err, rows) => {
    if (err) {
      console.error('Error fetching tickets:', err.message);
    } else {
      const data = JSON.stringify(rows);
      // Using the 'init' event for the initial data
      res.write(`event: init\ndata: ${data}\n\n`);
    }
  });

  // Register a listener for the 'ticketUpdated' event
  const ticketUpdatedListener = (data) => {
    // Using the 'update' event for ticket updates
    res.write(`event: update\ndata: ${data}\n\n`);
  };
  eventEmitter.on('ticketUpdated', ticketUpdatedListener);

  const refreshEventHandler = data => {
    console.log("refreshEventHandler triggered")
    res.write(`event: refresh\ndata: ${data}\n\n`);
  };

  eventEmitter.on('refreshToken', refreshEventHandler);


  // Remove the listener when the client disconnects
  req.on('close', () => {
    eventEmitter.off('ticketUpdated', ticketUpdatedListener);
    eventEmitter.removeListener('refreshToken', refreshEventHandler);

  });
});

// Handle the refresh request and trigger SSE updates
app.get('/refresh', (req, res) => {
  const refreshToken = req.headers['refreshtoken'];
  console.log("/refresh called");
  // Perform any necessary data fetching or processing
  // ...
  const updateData = { ...req.body, refreshtoken: refreshToken }; // Include the session ID in the update data
  console.log("/refresh called2");

  // Emit an SSE update event
  eventEmitter.emit('refreshToken', JSON.stringify(updateData));
  console.log("/refresh called3");

  // Send a response
  res.json({ message: 'Refresh request received.' });
});

// DELETE endpoint to delete a ticket by ID
app.delete('/tickets/:id', (req, res) => {
  const ticketId = req.params.id;
  const sessionId = req.headers['x-session-id']; // Access the custom header

  db.run('DELETE FROM tickets WHERE id = ?', ticketId, function (err) {
    if (err) {
      console.error('Error deleting ticket:', err.message);
      res.status(500).json({ error: 'Error deleting the ticket.' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Ticket not found.' });
    } else {
      res.status(200).json({ message: 'Ticket deleted successfully.' });
      const updateData = { ...req.body, sessionId: sessionId }; // Include the session ID in the update data
      eventEmitter.emit('ticketUpdated', JSON.stringify(updateData));
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
