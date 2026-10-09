const db = require('../db-postgres');

async function clean() {
  try {
    console.log('1. Deactivating low-quality question bank sources...');
    const qbRes = await db.pool.query(`
      UPDATE question_bank
      SET active = 0
      WHERE source IN ('ExamMock Original Master Bank', 'ExamMock Quality Bank v2')
         OR question LIKE '%[Variant%'
         OR question LIKE '%[Set%'
         OR question LIKE '%Set %'
         OR question LIKE '%4 : 16 :: 5 : ?%'
         OR question LIKE '%If A > B > C%'
         OR question LIKE '%Two quantities are in ratio%'
         OR question LIKE '%Find % of %'
         OR question LIKE '%A vehicle travels at%'
    `);
    console.log(`Deactivated ${qbRes.rowCount} low-quality bank questions.`);

    console.log('2. Inspecting papers table...');
    const papers = await db.pool.query(`SELECT id, exam_id, stage, status, questions_json FROM papers`);
    console.log(`Found ${papers.rows.length} total papers in DB.`);

    let badPaperIds = [];
    for (const p of papers.rows) {
      const qStr = typeof p.questions_json === 'string' ? p.questions_json : JSON.stringify(p.questions_json);
      if (
        qStr.includes('[Variant') ||
        qStr.includes('Set ') ||
        qStr.includes('If A > B > C') ||
        qStr.includes('Two quantities are in ratio') ||
        qStr.includes('Find 15% of 800') ||
        qStr.includes('Find 25% of 800') ||
        qStr.includes('A vehicle travels at') ||
        qStr.includes('4 : 16 :: 5 : ?') ||
        qStr.includes('She tried to mask her disappointment')
      ) {
        badPaperIds.push(p.id);
      }
    }
    console.log(`Identified ${badPaperIds.length} papers containing repetitive/low-quality questions.`);

    if (badPaperIds.length > 0) {
      // Check which papers have attempts
      const attemptsRes = await db.pool.query(
        `SELECT DISTINCT paper_id FROM attempts WHERE paper_id = ANY($1::text[])`,
        [badPaperIds]
      );
      const usedPaperIds = new Set(attemptsRes.rows.map(r => r.paper_id));
      const unusedPaperIds = badPaperIds.filter(id => !usedPaperIds.has(id));

      if (usedPaperIds.size > 0) {
        // Mark used papers as ARCHIVED so allocatePaper won't allocate them
        await db.pool.query(
          `UPDATE papers SET status = 'ARCHIVED' WHERE id = ANY($1::text[])`,
          [[...usedPaperIds]]
        );
        console.log(`Archived ${usedPaperIds.size} papers referenced by existing attempts.`);
      }

      if (unusedPaperIds.length > 0) {
        await db.pool.query(
          `DELETE FROM papers WHERE id = ANY($1::text[])`,
          [unusedPaperIds]
        );
        console.log(`Deleted ${unusedPaperIds.length} unused low-quality papers.`);
      }
    }

    // Check remaining READY papers
    const readyPapers = await db.pool.query(`SELECT count(*), exam_id, stage, status FROM papers GROUP BY exam_id, stage, status`);
    console.log('Remaining papers in DB:', readyPapers.rows);

    // Check active questions in question bank
    const activeQb = await db.pool.query(`SELECT count(*), source FROM question_bank WHERE active = 1 GROUP BY source`);
    console.log('Active question bank sources:', activeQb.rows);

  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await db.pool.end();
  }
}

clean();
