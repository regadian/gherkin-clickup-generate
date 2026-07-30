import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // API Route: Direct Import to Huly Test Management using @hcengineering/api-client
  app.post('/api/huly/import', async (req, res) => {
    const { serverUrl, workspace, email, password, spaceId, suiteId, testCases } = req.body;

    if (!serverUrl || !workspace || !email || !password || !spaceId) {
      return res.status(400).json({
        success: false,
        error: 'Data tidak lengkap. Diperlukan Server URL, Workspace, Email, Password, dan Space ID (Project ID).'
      });
    }

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tidak ada Test Case yang akan diimpor.'
      });
    }

    let client: any = null;

    try {
      console.log(`Menghubungkan ke Huly Server: ${serverUrl} (Workspace: ${workspace}, Email: ${email})...`);
      
      const { connect } = await import('@hcengineering/api-client');

      client = await connect(serverUrl.replace(/\/+$/, ''), {
        email: email.trim(),
        password: password,
        workspace: workspace.trim()
      });

      console.log(`Berhasil terhubung ke Huly! Mulai impor ${testCases.length} Test Cases...`);

      let successCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const titleName = (tc.title || `Test Case #${i + 1}`).trim();
        const rawDescription = tc.description || '';

        try {
          let caseId: string | null = null;

          if (suiteId && suiteId.trim() !== '') {
            // Option 1: Add to specific TestSuite
            caseId = await client.addCollection(
              'testManagement:class:TestCase',
              spaceId.trim(),
              suiteId.trim(),
              'testManagement:class:TestSuite',
              'testCases',
              {
                name: titleName,
                status: 0
              }
            );
          } else {
            // Option 2: Add to Space / Project directly
            caseId = await client.addCollection(
              'testManagement:class:TestCase',
              spaceId.trim(),
              spaceId.trim(),
              'tracker:class:Project',
              'testCases',
              {
                name: titleName,
                status: 0
              }
            );
          }

          // Upload description markdown if available
          if (caseId && rawDescription) {
            try {
              const markupRef = await client.uploadMarkup(
                'testManagement:class:TestCase',
                caseId,
                'description',
                rawDescription,
                'markdown'
              );

              await client.updateDoc('testManagement:class:TestCase', spaceId.trim(), caseId, {
                description: markupRef
              });
            } catch (descErr: any) {
              console.warn(`Gagal upload markup description untuk "${titleName}":`, descErr.message);
            }
          }

          successCount++;
        } catch (itemErr: any) {
          console.error(`Gagal mengunggah item "${titleName}":`, itemErr.message || itemErr);
          errors.push(`"${titleName}": ${itemErr.message || 'Error'}`);
        }
      }

      if (client) {
        await client.close().catch(() => {});
      }

      return res.json({
        success: true,
        message: `Berhasil mengimpor ${successCount} dari ${testCases.length} Test Cases ke Huly Test Management!`,
        successCount,
        totalCount: testCases.length,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (err: any) {
      if (client) {
        await client.close().catch(() => {});
      }
      console.error('Huly Import Server Error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Gagal terhubung ke Huly atau terjadi kesalahan saat mengunggah.'
      });
    }
  });

  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
