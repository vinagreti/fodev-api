"use strict";

module.exports=function(app, mongoose, config, utils, moment) {
    
    var Schema = mongoose.Schema;

    var Users = require('./../modules/Users.js');
    
    var TicketUpdates = mongoose.model('TicketUpdates', {
        user: { type : Schema.Types.ObjectId, ref: 'Users', required: 'O responsável pela mensagem não foi informado!' }
        , msg: {
                type: String, 
                trim: true, 
                required: 'Favor informar a mensagem.'
//                match: [/^.{20,}$/, 'A nova mensagem deve possuir ao menos 20 caracteres.']
        }
        , date: { type: Date, default: Date.now }
    });
    
    var Tickets = mongoose.model('Tickets', {
        kind: {
                type: String, 
                trim: true, 
                required: 'Favor informar o tipo de ticket.',
                match: [/contact|support|improvment/i, 'Tipo de ticket inválido.']
        },
        customer: { type : Schema.Types.ObjectId, ref: 'Users', required: 'Identifique o cliente!' },
        msg: {
                type: String, 
                trim: true, 
                required: 'Favor informar a mensagem.',
                match: [/^.{20,}$/, 'A mensagem deve possuir ao menos 20 caracteres.']
        },
        updates: [{ type : Schema.Types.ObjectId, ref: 'TicketUpdates' }],
        updated: { type: Date, default: Date.now }
    });
    
    app.get('/v1/tickets', utils.ensureAuthorized, utils.getRequestUser, function(req, res) {
        
        var filter = {};
        
        if(req.user.kind != 'admin') filter['customer._id'] = req.user._id;
        
        Tickets
        .find(filter, null, {sort: {updated: -1}})
        .lean()
        .populate(['customer'])
        .exec(function(err, tickets) {
                
            if (err) {
                
                res.statusCode = 400;
                
                res.send(err)
                
            } else {
                
                res.json(tickets);
                
            }
                
        });
    });
    
    app.get('/v1/ticket/:ticket_id', utils.ensureAuthorized, utils.getRequestUser, function(req, res) {

        var filter = {_id: req.params.ticket_id};
        
        if(req.user.kind != 'admin') filter['customer._id'] = req.user._id;
        
        Tickets.findOne(filter)
        .deepPopulate(['customer', 'updates.user', 'updates'])
        .exec(function(err, ticket) {
                
            if (err) {
                
                res.statusCode = 400;
                
                res.send(err)
                
            } else {
                
                res.json(ticket);
                
            }
                
        });

    });


    app.post('/v1/ticket/:ticket_id/update', utils.ensureAuthorized, utils.getRequestUser, function(req, res) {

        var filter = {_id: req.params.ticket_id};
        
        if(req.user.kind != 'admin') filter['customer._id'] = req.user._id;
        
        Tickets.findOne(filter)
        .populate(['customer'])
        .exec(function(err, ticket) {

            if (err) {
                
                res.statusCode = 400;
                    
                res.json({
                    type: false,
                    data: "Erro: " + err
                });
                
            } else {
                
                TicketUpdates.create({
                    
                    msg: req.body.msg
                    
                    , user: req.body.isCustomerMessage ? ticket.customer._id : req.user._id

                }, function(err, ticketUpdate) {

                        if (err) {
                            
                            res.statusCode = 400;

                            res.send(err);
                        
                        } else {
                            
                            ticket.updates.push(ticketUpdate._id);
                            
                            ticket.save(function(err, updatedTicket) {
                
                                if (err) {
                                        
                                        res.statusCode = 400;
                
                                        return res.send(err);
                
                                } else {
                                    
                                    Tickets.deepPopulate(updatedTicket, ['customer', 'updates.user', 'updates'], function(err, updatedTicketPopulated) {
                                        
                                        if (err) {
                                                
                                                res.statusCode = 400;
                        
                                                return res.send(err);
                        
                                        } else {
                                            
                                            if(!req.body.isCustomerMessage || req.user._id != updatedTicketPopulated.customer._id){
                                            
                                                send_reply_email(updatedTicketPopulated);
                                                
                                            }
                                            
                                            res.json(updatedTicketPopulated);
                                            
                                        }
                                        
                                    });
                                    
                                }
                
                            });
                            
                        }

                });
                
            }
            
        });

    });
    
    
    app.post('/v1/ticket', utils.getRequestUser, function(req, res) {

        Users.findOne({email: req.body.email}, function(err, user) {

            if (err) {
                
                res.statusCode = 400;
                    
                res.json({
                    type: false,
                    data: "Erro: " + err
                });
                
            } else {
                    
                if (user) {
                    
                    createTicket(user);
                        
                } else {
                    
                    var crypto = require('crypto');
                    
                    Users.create({
    
                            name : req.body.name,
    
                            email : req.body.email,
                            
                            phone : req.body.phone,
                            
                            kind : 'contact',
                            
                            password : crypto.createHash('md5').update(req.body.email).digest('hex')
    
                    }, function(err, user) {
    
                            if (err) {
                                
                                res.statusCode = 400;
    
                                res.send(err);
                            
                            } else {
                                
                                user.password = req.body.email;
                                
                                createTicket(user._id, true);
                                
                            }
    
                    });

                }
            }
        });
        
        var createTicket = function(customer_id, newCustomer){

            Tickets.create({
    
                kind : req.body.kind,
    
                msg: req.body.msg,
                
                customer: customer_id
    
            }, function(err, ticket) {
    
                if (err) {
                        res.statusCode = 400;
                        res.send(err);
                } else {

                    if(newCustomer){
                        
                        send_ticket_email_new_customer(ticket);
                        
                    } else {
                        
                        send_ticket_email(ticket);
                        
                    }

                    res.json(ticket);
                    
                }
    
            });
        }
    });
        
    var send_ticket_email = function(ticket){
        
        var nodemailer = require('nodemailer');
        var path = require('path');
        var templatesDir   = path.join(__dirname, '../templates');
        var emailTemplates = require('email-templates');

        var transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465, // 465
            secure: true, // true
            debug : true,
            auth: {
                user: 'bruno@tzadi.com',
                pass: 'Dublin2010ireland'
            }
        });

        emailTemplates(templatesDir, function(err, template) {
             
            if (err) {
                console.log(err);
            } else {
              
                template('tickets/' + ticket.kind, ticket, function(err, html, text) {
                    if (err) {
                        console.log(err);
                    } else {
                        var mailOptions = {
                            from: 'Feira Orgânica Delivery <info@feiraorganica.com>', //sender address
                            replyTo: "info@feiraorganica.com",
                            to: ticket.email, // list of receivers
                            cc: 'info@feiraorganica.com', // list of BCC receivers 'bruno@tzadi.com, denisefaccin@gmail.com'
                            subject: config.envTag + 'Contato recebido',
                            text: text,
                            html: html
                        };
                        transporter.sendMail(mailOptions, function(error, info){
                            if(error){
                                console.log(error);
                            }else{
                                console.log('Message sent: ' + info.response);
                            }
                        });
                    }
                });
            }
        });
    }
    
    var send_ticket_email_new_customer = function(ticket){
        
        var nodemailer = require('nodemailer');
        var path = require('path');
        var templatesDir   = path.join(__dirname, '../templates');
        var emailTemplates = require('email-templates');

        var transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465, // 465
            secure: true, // true
            debug : true,
            auth: {
                user: 'bruno@tzadi.com',
                pass: 'Dublin2010ireland'
            }
        });

        emailTemplates(templatesDir, function(err, template) {
             
            if (err) {
                console.log(err);
            } else {
              
                template('tickets/' + ticket.kind + '_new_customer', ticket, function(err, html, text) {
                    if (err) {
                        console.log(err);
                    } else {
                        var mailOptions = {
                            from: 'Feira Orgânica Delivery <info@feiraorganica.com>', //sender address
                            replyTo: "info@feiraorganica.com",
                            to: ticket.email, // list of receivers
                            cc: 'info@feiraorganica.com', // list of BCC receivers 'bruno@tzadi.com, denisefaccin@gmail.com'
                            subject: config.envTag + 'Contato recebido',
                            text: text,
                            html: html
                        };
                        transporter.sendMail(mailOptions, function(error, info){
                            if(error){
                                console.log(error);
                            }else{
                                console.log('Message sent: ' + info.response);
                            }
                        });
                    }
                });
            }
        });
    }
    
    var send_reply_email = function(ticket){
        
        var nodemailer = require('nodemailer');
        var path = require('path');
        var templatesDir   = path.join(__dirname, '../templates');
        var emailTemplates = require('email-templates');

        var transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465, // 465
            secure: true, // true
            debug : true,
            auth: {
                user: 'bruno@tzadi.com',
                pass: 'Dublin2010ireland'
            }
        });

        emailTemplates(templatesDir, function(err, template) {
             
            if (err) {
                console.log(err);
            } else {
              
                template('tickets/reply', ticket, function(err, html, text) {
                    if (err) {
                        console.log(err);
                    } else {
                        var mailOptions = {
                            from: 'Feira Orgânica Delivery <info@feiraorganica.com>', //sender address
                            replyTo: "info@feiraorganica.com",
                            to: ticket.email, // list of receivers
                            cc: 'info@feiraorganica.com', // list of BCC receivers 'bruno@tzadi.com, denisefaccin@gmail.com'
                            subject: config.envTag + 'Contato recebido',
                            text: text,
                            html: html
                        };
                        transporter.sendMail(mailOptions, function(error, info){
                            if(error){
                                console.log(error);
                            }else{
                                console.log('Message sent: ' + info.response);
                            }
                        });
                    }
                });
            }
        });
    }
}
