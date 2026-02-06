import axios, { AxiosResponse } from 'axios'

const sendEmail = (
  toEmail: string,
  toName: string,
  subject: string,
  content: string,
): Promise<AxiosResponse<any>> => {
  const apiKey = process.env.MAILJET_API_KEY
  const apiSecret = process.env.MAILJET_API_SECRET

  return axios.post(
    'https://api.mailjet.com/v3.1/send',
    {
      Messages: [
        {
          From: {
            Email: `noreply@${process.env.APP_BASE_URL?.replace('https://', '').replace('http://', '')}`,
            Name: process.env.APP_NAME || 'Web Messages',
          },
          To: [
            {
              Email: toEmail,
              Name: toName,
            },
          ],
          Subject: subject,
          HTMLPart: content,
        },
      ],
    },
    {
      auth: {
        username: apiKey || '',
        password: apiSecret || '',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
}

export default sendEmail
