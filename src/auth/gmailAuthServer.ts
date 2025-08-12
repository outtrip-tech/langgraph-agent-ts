import express from 'express';
import { google } from 'googleapis';
import open from 'open';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

interface TokenData {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

async function startGmailAuthServer(): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || `http://localhost:${port}/oauth2callback`
  );

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
      res.status(400).send('Authorization code not found');
      return;
    }

    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      
      console.log('\n🎉 Autenticación exitosa!');
      console.log('=============================================');
      console.log('📋 Copia estos tokens en tu archivo .env:');
      console.log('=============================================');
      console.log(`GMAIL_ACCESS_TOKEN=${tokens.access_token}`);
      console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('=============================================\n');

      const tokenData: TokenData = {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || '',
        scope: tokens.scope || scopes.join(' '),
        token_type: tokens.token_type || 'Bearer',
        expiry_date: tokens.expiry_date || 0
      };

      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h2 style="color: #4CAF50;">✅ Autenticación exitosa</h2>
            <p>Los tokens han sido generados correctamente. Revisa tu consola para obtener las variables de entorno.</p>
            <p><strong>Puedes cerrar esta ventana.</strong></p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
              <h4>Próximos pasos:</h4>
              <ol>
                <li>Copia los tokens mostrados en la consola</li>
                <li>Agrégalos a tu archivo .env</li>
                <li>Ya puedes usar la GmailTool con OAuth2</li>
              </ol>
            </div>
          </body>
        </html>
      `);

      setTimeout(() => {
        console.log('🔄 Cerrando servidor en 5 segundos...');
        process.exit(0);
      }, 5000);

    } catch (error) {
      console.error('❌ Error obteniendo tokens:', error);
      res.status(500).send('Error durante la autenticación');
    }
  });

  const server = app.listen(port, () => {
    console.log(`🚀 Servidor de autenticación iniciado en http://localhost:${port}`);
    console.log('🌐 Abriendo navegador para autenticación...\n');
    
    open(authUrl).catch(err => {
      console.error('❌ No se pudo abrir el navegador automáticamente.');
      console.log('🔗 Abre manualmente esta URL en tu navegador:');
      console.log(authUrl);
    });
  });

  server.on('error', (err) => {
    console.error('❌ Error del servidor:', err);
    process.exit(1);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔐 Iniciando autenticación OAuth2 para Gmail...\n');
  
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    console.error('❌ Error: Variables de entorno faltantes');
    console.log('Asegúrate de tener en tu .env:');
    console.log('- GMAIL_CLIENT_ID=tu_client_id');
    console.log('- GMAIL_CLIENT_SECRET=tu_client_secret');
    console.log('- GMAIL_REDIRECT_URI=http://localhost:3000/oauth2callback (opcional)');
    process.exit(1);
  }
  
  startGmailAuthServer();
}

export { startGmailAuthServer };