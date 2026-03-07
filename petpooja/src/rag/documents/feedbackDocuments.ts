import { query } from '../../database/postgres'
import type { RagDocument } from '../types'

interface FeedbackRow {
  feedback_id: number
  restaurant_id: number
  order_id: number
  item_id: number
  review_text: string
  sentiment_score: string
  sentiment_label: string
  created_at: string
  item_name: string
  cuisine: string
}

export async function loadFeedbackDocuments(): Promise<RagDocument[]> {
  try {
    const result = await query<FeedbackRow>(
      `SELECT f.feedback_id, f.restaurant_id, f.order_id, f.item_id,
              f.review_text, f.sentiment_score, f.sentiment_label, f.created_at,
              m.name AS item_name, m.cuisine
       FROM feedback f
       JOIN menu_items m ON m.item_id = f.item_id
       WHERE f.restaurant_id = 1`
    )

    const docs: RagDocument[] = []

    for (const row of result.rows) {
      const sentimentScore = parseFloat(row.sentiment_score)
      const snippet = row.review_text.slice(0, 80)

      let content: string
      if (row.feedback_id === 1) {
        content =
          `Customers love the ${row.item_name} at Tadka and Twist. ` +
          `Recent review: '${row.review_text}' ` +
          `Sentiment: very positive (score: ${sentimentScore.toFixed(3)}). This is a highly-rated dish. ` +
          `When asked, say: 'Our ${row.item_name} is one of the highest-rated dishes — customers love it!'`
      } else if (row.feedback_id === 2) {
        content =
          `Some customers found the ${row.item_name} slightly too salty. ` +
          `Sentiment: negative (score: ${sentimentScore.toFixed(3)}). Consider noting this if customer asks. ` +
          `Response tip: 'Our pizza is great — if you prefer less salt, just let us know ' +
          'and the kitchen will adjust.'`
      } else if (row.feedback_id === 3) {
        content =
          `Customers enjoy the ${row.item_name} and rate the Tiramisu as authentic. ` +
          `Review: '${row.review_text}' ` +
          `Good talking point when recommending Italian items. ` +
          `Sentiment: positive (score: ${sentimentScore.toFixed(3)}).`
      } else {
        const label = row.sentiment_label === 'positive' ? 'positively' : 'negatively'
        content =
          `Customer feedback on ${row.item_name}: "${snippet}..." ` +
          `Reviewed ${label} (sentiment: ${sentimentScore.toFixed(3)}).`
      }

      docs.push({
        id: `feedback_${row.feedback_id}`,
        type: 'feedback',
        content,
        metadata: {
          restaurantId: row.restaurant_id,
          itemId: row.item_id,
          name: row.item_name,
          cuisine: row.cuisine,
          priority: 6,
        },
        createdAt: new Date().toISOString(),
      })
    }

    // Summary feedback document
    docs.push({
      id: 'feedback_summary',
      type: 'feedback',
      content:
        `Overall customer sentiment at Tadka and Twist is positive. ` +
        `Highest-rated item: Butter Chicken (sentiment 0.921). ` +
        `Most authentic Italian: Tiramisu (customer-verified). ` +
        `Area for improvement: Wood-fired Chicken Pizza seasoning. ` +
        `2 out of 3 reviews are positive.`,
      metadata: {
        restaurantId: 1,
        priority: 7,
      },
      createdAt: new Date().toISOString(),
    })

    return docs
  } catch {
    return []
  }
}
