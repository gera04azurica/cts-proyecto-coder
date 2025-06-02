// api/capi.js

import crypto from 'crypto';

export default async function handler(req, res) {
  // 1) Solo permitimos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2) Leer datos enviados desde el front-end
  const { nombre, email, telefono, mensaje } = req.body || {};

  // 2.1) Validación mínima (al menos email o teléfono)
  if (!email && !telefono) {
    return res.status(400).json({ error: 'Faltan datos de usuario (email o teléfono).' });
  }

  // 3) Obtener Pixel ID y Access Token de variables de entorno
  const pixelId     = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.error('❌ Faltan META_PIXEL_ID o META_ACCESS_TOKEN en process.env');
    return res.status(500).json({ error: 'Configuración de CAPI incompleta.' });
  }

  // 4) Construir user_data con hash SHA-256 (recomendado por Meta)
  const userData = {};
  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    userData.em = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
  }
  if (telefono) {
    const onlyDigits = telefono.replace(/\D+/g, '');
    userData.ph = crypto.createHash('sha256').update(onlyDigits).digest('hex');
  }
  // (Opcional) Puedes agregar client_ip_address o client_user_agent:
  // userData.client_ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  // userData.client_user_agent = req.headers['user-agent'];

  // 5) Construir payload para Conversions API
  const eventPayload = {
    data: [
      {
        event_name:       'ContactFormSubmission',               // Nombre arbitrario de tu evento
        event_time:       Math.floor(Date.now() / 1000),        // timestamp en segundos
        event_source_url: req.headers.referer || '',            // página donde se envió
        action_source:    'website',
        user_data:        userData,
        custom_data: {
          content_name:      'Formulario de Contacto',
          content_category:  'Lead'
          // Si tuvieras valor monetario: value, currency, etc.
        }
      }
    ],
    access_token: accessToken
  };

  // 6) Enviar la petición a Meta Graph API
  const endpoint = `https://graph.facebook.com/v14.0/${pixelId}/events`;

  try {
    const graphRes = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(eventPayload)
    });
    const graphData = await graphRes.json();

    if (!graphRes.ok) {
      console.error('❌ Error en respuesta de Meta CAPI:', graphData);
      return res.status(502).json({ error: 'Error en CAPI', details: graphData });
    }

    // 7) (Opcional) Aquí puedes ejecutar otras acciones:
    //    – Enviar un e-mail de notificación
    //    – Guardar en base de datos
    //    – Lo que necesites antes de responder al cliente

    return res.status(200).json({ success: true, result: graphData });
  } catch (err) {
    console.error('❌ Error interno en la función CAPI:', err);
    return res.status(500).json({ error: 'Error interno del servidor CAPI.' });
  }
}

