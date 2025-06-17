const express = require('express');
const cors = require('cors');
const connection = require('./database'); // conexión a MySQL
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const saltRounds = 10;

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Obtener clientes por jefe_id
app.get('/clientes', (req, res) => {
  const jefeId = req.query.jefe_id;

  if (!jefeId) {
    return res.status(400).json({ error: 'Se requiere el id del jefe' });
  }

  const query = 'SELECT * FROM clientes WHERE jefe_id = ?';

  connection.query(query, [jefeId], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Error en la base de datos' });
    }
    res.json(results);
  });
});

// Obtener productos por jefe_id
app.get('/productos', (req, res) => {
  const jefeId = req.query.jefe_id;

  if (!jefeId) {
    return res.status(400).json({ error: 'Se requiere el id del jefe' });
  }

  const query = `
    SELECT 
      p.id, p.nombre, p.descripcion, p.modelo, p.marca, 
      p.cantidad, p.precio, p.ubicacion, 
      DATE_FORMAT(p.fecha_ingreso, '%Y-%m-%d') as fecha_ingreso, 
      p.categoria_id, c.nombre as categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.jefe_id = ?
  `;

  connection.query(query, [jefeId], (err, results) => {
    if (err) {
      console.error('Error al obtener productos:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    res.json(results);
  });
});


app.post('/productos/registrar', (req, res) => {
  const { nombre, descripcion, modelo, marca, cantidad, precio, ubicacion, fecha_ingreso, categoria_id, jefe_id } = req.body;

  if (!nombre || !descripcion || !cantidad || !precio || !ubicacion || !fecha_ingreso || !categoria_id || !jefe_id) {
    return res.status(400).json({ error: 'Todos los campos requeridos deben ser completados.' });
  }

  const query = `
    INSERT INTO productos (nombre, descripcion, modelo, marca, cantidad, precio, ubicacion, fecha_ingreso, categoria_id, jefe_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const values = [nombre, descripcion, modelo, marca, cantidad, precio, ubicacion, fecha_ingreso, categoria_id, jefe_id];

  connection.query(query, values, (err, result) => {
    if (err) {
      console.error('Error al registrar producto:', err);
      return res.status(500).json({ error: 'Error al registrar producto.' });
    }
    res.json({ message: 'Producto registrado correctamente.' });
  });
});

// Descargar clientes en Excel por jefe_id
app.get('/clientes/excel', async (req, res) => {
  const jefeId = req.query.jefe_id;

  if (!jefeId) {
    return res.status(400).json({ error: 'Se requiere jefe_id' });
  }

  const query = 'SELECT nombre, telefono, email, direccion FROM clientes WHERE jefe_id = ?';

  connection.query(query, [jefeId], async (err, results) => {
    if (err) {
      return res.status(500).send('Error al generar Excel');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Clientes');

    worksheet.columns = [
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Teléfono', key: 'telefono', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Dirección', key: 'direccion', width: 40 },
    ];

    worksheet.addRows(results);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=clientes.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  });
});

// Registro de jefe
app.post('/jefe/registro', async (req, res) => {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  try {
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);
    const query = 'INSERT INTO jefe (usuario, contrasena) VALUES (?, ?)';

    connection.query(query, [usuario, hashedPassword], (err, results) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'El usuario ya existe' });
        }
        return res.status(500).json({ error: 'Error al guardar usuario' });
      }
      res.status(201).json({ message: 'Usuario registrado correctamente', id: results.insertId });
    });
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Registrar cliente
app.post('/clientes/registrar', async (req, res) => {
  const { nombre, telefono, email, direccion, jefe_id } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }

  try {
    const query = 'INSERT INTO clientes (nombre, telefono, email, direccion, jefe_id) VALUES (?, ?, ?, ?, ?)';

    connection.query(query, [nombre, telefono, email, direccion, jefe_id], (err, results) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Cliente ya existe' });
        }
        return res.status(500).json({ error: 'Error al guardar cliente' });
      }

      res.status(201).json({ message: 'Cliente registrado correctamente', id: results.insertId });
    });

  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Login jefe
app.post('/jefe/login', (req, res) => {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  const query = 'SELECT * FROM jefe WHERE usuario = ?';
  connection.query(query, [usuario], async (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const jefe = results[0];
    const isMatch = await bcrypt.compare(contrasena, jefe.contrasena);

    if (!isMatch) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    res.json({
      message: 'Inicio de sesión exitoso',
      jefe: {
        id: jefe.id,
        usuario: jefe.usuario
      }
    });
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${port}`);
});
