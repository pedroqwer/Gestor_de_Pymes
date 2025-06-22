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
      p.cantidad, p.precio_compra, p.precio_venta, p.ubicacion, 
      DATE_FORMAT(p.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso, 
      p.categoria_id, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.jefe_id = ?
  `;

  connection.query(query, [jefeId], (err, results) => {
    if (err) {
      console.error('Error al obtener productos:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'No se encontraron productos para este jefe' });
    }

    res.json(results);
  });
});

app.get('/productos/venta', (req, res) => {
  const jefeId = req.query.jefe_id;

  if (!jefeId) {
    return res.status(400).json({ error: 'Se requiere el id del jefe' });
  }

  const query = `
    SELECT 
      p.id, p.nombre, p.descripcion, p.modelo, p.marca, 
      p.cantidad, p.precio_compra, p.precio_venta, p.ubicacion, 
      DATE_FORMAT(p.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso, 
      p.categoria_id, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.jefe_id = ? AND p.cantidad > 0
  `;

  connection.query(query, [jefeId], (err, results) => {
    if (err) {
      console.error('Error al obtener productos:', err);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'No se encontraron productos disponibles para vender' });
    }

    res.json(results);
  });
});

app.put('/productos/actualizar-cantidad', (req, res) => {
  const { producto_id, cantidad, jefe_id } = req.body;

  if (!producto_id || cantidad == null || !jefe_id) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const query = `UPDATE productos SET cantidad = ? WHERE id = ? AND jefe_id = ?`;

  connection.query(query, [cantidad, producto_id, jefe_id], (err, result) => {
    if (err) {
      console.error('Error al actualizar cantidad:', err);
      return res.status(500).json({ error: 'Error al actualizar cantidad del producto' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ message: 'Cantidad actualizada correctamente' });
  });
});

/*
// Registrar nuevo producto (con manejo de categoría por nombre)
app.post('/productos/registrar', (req, res) => {
  const {
    nombre, descripcion, modelo, marca, cantidad,
    precio_compra, precio_venta, ubicacion, fecha_ingreso,
    categoria_nombre, jefe_id
  } = req.body;

  if (!nombre || !descripcion || !cantidad || !precio_compra || !precio_venta || !ubicacion || !fecha_ingreso || !categoria_nombre || !jefe_id) {
    return res.status(400).json({ error: 'Todos los campos requeridos deben ser completados.' });
  }
    

  // Paso 1: Buscar o crear categoría
  const buscarOCrearCategoria = () => {
    return new Promise((resolve, reject) => {
      const buscarQuery = `SELECT id FROM categorias WHERE nombre = ?`;
      connection.query(buscarQuery, [categoria_nombre], (err, results) => {
        if (err) return reject(err);

        if (results.length > 0) {
          resolve(results[0].id); // Ya existe, usar esa ID
        } else {
          const insertarCategoria = `INSERT INTO categorias (nombre) VALUES (?)`;
          connection.query(insertarCategoria, [categoria_nombre], (err, result) => {
            if (err) return reject(err);
            resolve(result.insertId); // Nueva categoría creada
          });
        }
      });
    });
  };

  // Paso 2: Insertar producto con la categoría obtenida
  buscarOCrearCategoria()
    .then(categoria_id => {
      const query = `
        INSERT INTO productos (
          nombre, descripcion, modelo, marca, cantidad,
          precio_compra, precio_venta, ubicacion, fecha_ingreso,
          categoria_id, jefe_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const values = [
        nombre, descripcion, modelo, marca, cantidad,
        precio_compra, precio_venta, ubicacion, fecha_ingreso,
        categoria_id, jefe_id
      ];

      connection.query(query, values, (err, result) => {
        if (err) {
          console.error('Error al registrar producto:', err);
          return res.status(500).json({ error: 'Error al registrar producto.' });
        }
        res.json({ message: 'Producto registrado correctamente.' });
      });
    })
    .catch(err => {
      console.error('Error al manejar categoría:', err);
      res.status(500).json({ error: 'Error al procesar la categoría.' });
    });
});*/


// Registrar entrada
app.post('/entradas/registrar', (req, res) => {
  const { producto_id, cantidad, precio_compra, proveedor_id, jefe_id } = req.body;

  if (!producto_id || !cantidad || !precio_compra || !proveedor_id || !jefe_id) {
    return res.status(400).json({ error: 'Datos incompletos para registrar la entrada' });
  }

  connection.beginTransaction(err => {
    if (err) return res.status(500).json({ error: 'Error al iniciar transacción' });

    const insertEntrada = `
      INSERT INTO entradas (producto_id, cantidad, precio_compra, proveedor_id, jefe_id)
      VALUES (?, ?, ?, ?, ?)`;

    connection.query(insertEntrada, [producto_id, cantidad, precio_compra, proveedor_id, jefe_id], (err) => {
      if (err) {
        return connection.rollback(() => {
          res.status(500).json({ error: 'Error al registrar entrada' });
        });
      }

      const updateProducto = `UPDATE productos SET cantidad = cantidad + ?, precio_compra = ? WHERE id = ?`;

      connection.query(updateProducto, [cantidad, precio_compra, producto_id], (err) => {
        if (err) {
          return connection.rollback(() => {
            res.status(500).json({ error: 'Error al actualizar producto' });
          });
        }

        const insertMovimiento = `
          INSERT INTO movimientos (tipo, producto_id, cantidad, jefe_id, observacion)
          VALUES ('entrada', ?, ?, ?, 'Entrada por proveedor ID ${proveedor_id}')`;

        connection.query(insertMovimiento, [producto_id, cantidad, jefe_id], (err) => {
          if (err) {
            return connection.rollback(() => {
              res.status(500).json({ error: 'Error al insertar movimiento' });
            });
          }

          connection.commit(err => {
            if (err) {
              return connection.rollback(() => {
                res.status(500).json({ error: 'Error al confirmar la transacción' });
              });
            }

            res.json({ message: 'Entrada registrada correctamente' });
          });
        });
      });
    });
  });
});

// Descargar clientes en Excel
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

// Registrar venta
app.post('/ventas/registrar', (req, res) => {
  const { cliente_id, jefe_id, productos } = req.body;

  if (!cliente_id || !jefe_id || !Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos para la venta' });
  }

  const total = productos.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

  connection.beginTransaction(err => {
    if (err) return res.status(500).json({ error: 'Error al iniciar transacción' });

    connection.query(
      'INSERT INTO ventas (cliente_id, total, jefe_id) VALUES (?, ?, ?)',
      [cliente_id, total, jefe_id],
      (err, resultVenta) => {
        if (err) {
          return connection.rollback(() => {
            res.status(500).json({ error: 'Error al registrar venta' });
          });
        }

        const ventaId = resultVenta.insertId;

        const tareas = productos.map(producto => {
          return new Promise((resolve, reject) => {
            const { id: producto_id, cantidad, precio } = producto;

            connection.query(
              'INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
              [ventaId, producto_id, cantidad, precio],
              (err) => {
                if (err) return reject(err);

                connection.query(
                  'UPDATE productos SET cantidad = cantidad - ? WHERE id = ?',
                  [cantidad, producto_id],
                  (err) => {
                    if (err) return reject(err);

                    connection.query(
                      'INSERT INTO movimientos (tipo, producto_id, cantidad, jefe_id, observacion) VALUES (?, ?, ?, ?, ?)',
                      ['salida', producto_id, cantidad, jefe_id, `Venta ID ${ventaId}`],
                      (err) => {
                        if (err) return reject(err);
                        resolve();
                      }
                    );
                  }
                );
              }
            );
          });
        });

        Promise.all(tareas)
          .then(() => {
            connection.commit(err => {
              if (err) {
                return connection.rollback(() => {
                  res.status(500).json({ error: 'Error al confirmar la transacción' });
                });
              }
              res.json({ message: 'Venta registrada correctamente', venta_id: ventaId });
            });
          })
          .catch(err => {
            connection.rollback(() => {
              console.error('Error durante la venta:', err);
              res.status(500).json({ error: 'Error al procesar la venta' });
            });
          });
      }
    );
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${port}`);
});
